<?php

namespace App\InterfaceAdapters\Gateways;

use App\UseCases\Ports\AiScoringGatewayPort;
use GuzzleHttp\ClientInterface;
use Psr\Log\LoggerInterface;
use Throwable;

final class GuzzleAiScoringGateway implements AiScoringGatewayPort
{
    public function __construct(
        private readonly ClientInterface $http,
        private readonly LoggerInterface $logger,
        private readonly string $baseUrl,
    ) {}

    public function score(array $resume, array $vacancy): ?array
    {
        if ($this->baseUrl === '') return null;
        try {
            $response = $this->http->request('POST', rtrim($this->baseUrl, '/').'/api/v1/ai/predict-compatibility', [
                'json' => ['resume' => $resume, 'vacancy' => $vacancy],
                'timeout' => 3,
                'connect_timeout' => 1,
            ]);
            $result = json_decode((string) $response->getBody(), true, flags: JSON_THROW_ON_ERROR);
            if (!is_array($result) || !isset($result['score']) || !is_numeric($result['score'])) {
                throw new \UnexpectedValueException('ai-node devolvió un puntaje inválido');
            }
            $score = (float) $result['score'];
            if ($score < 0 || $score > 100) {
                throw new \UnexpectedValueException('ai-node devolvió un puntaje fuera de 0..100');
            }
            return [
                'score' => $score,
                'breakdown' => is_array($result['breakdown'] ?? null) ? $result['breakdown'] : [],
                'modelVersion' => (string) ($result['modelVersion'] ?? 'ai-node'),
            ];
        } catch (Throwable $exception) {
            $this->logger->warning('ai-node no disponible o devolvió una respuesta inválida; se usará score local', [
                'exception' => $exception->getMessage(),
            ]);
            return null;
        }
    }
}
