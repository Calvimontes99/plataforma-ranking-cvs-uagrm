<?php

namespace App\InterfaceAdapters\Gateways;

use App\UseCases\Ports\VacancyGatewayPort;
use RuntimeException;

final class GrpcVacancyGateway implements VacancyGatewayPort
{
    public function __construct(
        private readonly string $address,
        private readonly int $timeoutSeconds = 5,
    ) {}

    public function createContract(array $command): array
    {
        $request = ProtoWireCodec::string(2, (string) $command['sagaId'])
            .ProtoWireCodec::string(3, (string) $command['vacancyId'])
            .ProtoWireCodec::string(4, (string) $command['applicationId'])
            .ProtoWireCodec::string(5, (string) $command['candidateId']);
        $fields = $this->call('/recruitment.v1.VacancyService/CreateContract', $request);
        $status = (int) ($fields[4][0] ?? 0);
        return [
            'sagaId' => $fields[1][0] ?? $command['sagaId'],
            'contractId' => $fields[2][0] ?? '',
            'remainingSlots' => (int) ($fields[3][0] ?? 0),
            'status' => match ($status) { 2 => 'COMPLETED', 3 => 'REJECTED', default => 'UNKNOWN' },
            'reason' => $this->firstErrorMessage($fields[6] ?? []),
        ];
    }

    public function preapprove(array $command): array
    {
        $request = ProtoWireCodec::string(2, (string) $command['vacancyId'])
            .ProtoWireCodec::string(3, (string) $command['applicationId'])
            .ProtoWireCodec::string(4, (string) $command['candidateId'])
            .self::doubleField(5, (float) $command['score'])
            .ProtoWireCodec::string(6, (string) $command['rankingId']);
        $fields = $this->call('/recruitment.v1.VacancyService/PreapproveCandidate', $request);
        return [
            'preapprovalId' => $fields[1][0] ?? '',
            'status' => (int) ($fields[2][0] ?? 0) === 4 ? 'PREAPPROVED' : 'UNKNOWN',
        ];
    }

    private function call(string $path, string $request): array
    {
        if (!function_exists('curl_init')) throw new RuntimeException('La extensión PHP cURL es obligatoria para gRPC');
        $parts = explode(':', $this->address, 2);
        if (count($parts) !== 2) throw new RuntimeException('VACANCY_GRPC_ADDRESS debe tener host:puerto');
        $url = 'http://'.$parts[0].':'.$parts[1].$path;
        $frame = "\0".pack('N', strlen($request)).$request;
        $headers = [];
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $frame,
            CURLOPT_HTTPHEADER => ['content-type: application/grpc', 'te: trailers', 'grpc-accept-encoding: identity'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$headers): int {
                $length = strlen($line);
                if (str_contains($line, ':')) {
                    [$name, $value] = explode(':', $line, 2);
                    $headers[strtolower(trim($name))] = trim($value);
                }
                return $length;
            },
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_PRIOR_KNOWLEDGE,
            CURLOPT_CONNECTTIMEOUT => min(2, $this->timeoutSeconds),
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
        ]);
        $response = curl_exec($handle);
        if ($response === false) {
            $error = curl_error($handle);
            curl_close($handle);
            throw new RuntimeException("Fallo gRPC a ms-vacantes: $error");
        }
        $statusCode = (int) ($headers['grpc-status'] ?? 0);
        $grpcMessage = $headers['grpc-message'] ?? '';
        curl_close($handle);
        if ($statusCode !== 0) {
            throw new RuntimeException("ms-vacantes gRPC status $statusCode: ".rawurldecode($grpcMessage));
        }
        if (strlen($response) < 5 || ord($response[0]) !== 0) {
            throw new RuntimeException('Respuesta gRPC de ms-vacantes inválida o comprimida');
        }
        $length = unpack('Nlength', substr($response, 1, 4))['length'];
        if (strlen($response) !== 5 + $length) {
            throw new RuntimeException('Longitud de respuesta gRPC inconsistente');
        }
        return ProtoWireCodec::fields(substr($response, 5));
    }

    private static function doubleField(int $field, float $value): string
    {
        return ProtoWireCodec::varint(($field << 3) | 1).pack('e', $value);
    }

    private function firstErrorMessage(array $encodedErrors): ?string
    {
        if (!$encodedErrors) return null;
        $fields = ProtoWireCodec::fields($encodedErrors[0]);
        return $fields[2][0] ?? null;
    }
}
