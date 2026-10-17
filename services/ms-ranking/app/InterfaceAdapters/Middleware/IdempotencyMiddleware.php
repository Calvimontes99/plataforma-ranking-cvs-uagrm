<?php

namespace App\InterfaceAdapters\Middleware;

use App\Entities\IdempotencyRecord;
use App\UseCases\Ports\IdempotencyRepositoryPort;
use Closure;
use DateTimeImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class IdempotencyMiddleware
{
    public function __construct(private readonly IdempotencyRepositoryPort $records) {}

    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->header('Idempotency-Key');
        if (!is_string($key) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $key)) {
            return response()->json(['code' => 'INVALID_IDEMPOTENCY_KEY', 'message' => 'Idempotency-Key debe ser un UUIDv4'], 400);
        }
        $requestHash = hash('sha256', json_encode($this->canonicalize([
            'method' => $request->method(), 'path' => $request->path(),
            'query' => $request->query(), 'body' => $request->all(),
        ]), JSON_THROW_ON_ERROR));
        $existing = $this->records->find($key);
        if ($existing !== null) {
            if (!hash_equals($existing->requestHash, $requestHash)) {
                return response()->json(['code' => 'IDEMPOTENCY_KEY_REUSED', 'message' => 'La clave ya se utilizó con otro contenido'], 409);
            }
            if ($existing->completed && $existing->responseStatus !== null) {
                return response()->json($existing->responseBody ?? [], $existing->responseStatus);
            }
            return response()->json(['code' => 'REQUEST_IN_PROGRESS', 'message' => 'La solicitud con esta clave sigue en curso'], 409);
        }
        $ttl = max(60, (int) config('services.idempotency_ttl', 86400));
        if (!$this->records->claim(new IdempotencyRecord(
            $key, $requestHash, null, null, (new DateTimeImmutable())->modify("+$ttl seconds"),
        ))) {
            $existing = $this->records->find($key);
            if ($existing && !hash_equals($existing->requestHash, $requestHash)) {
                return response()->json(['code' => 'IDEMPOTENCY_KEY_REUSED', 'message' => 'La clave ya se utilizó con otro contenido'], 409);
            }
            return response()->json(['code' => 'REQUEST_IN_PROGRESS', 'message' => 'La solicitud con esta clave sigue en curso'], 409);
        }

        try {
            $response = $next($request);
            if ($response->getStatusCode() >= 500) {
                $this->records->release($key);
                return $response;
            }
            $body = json_decode($response->getContent(), true);
            if (!is_array($body)) $body = ['data' => $response->getContent()];
            $this->records->complete($key, $response->getStatusCode(), $body);
            return $response;
        } catch (\Throwable $exception) {
            $this->records->release($key);
            throw $exception;
        }
    }

    private function canonicalize(array $value): array
    {
        foreach ($value as &$item) {
            if (is_array($item)) $item = $this->canonicalize($item);
        }
        unset($item);
        if (!array_is_list($value)) ksort($value);
        return $value;
    }
}
