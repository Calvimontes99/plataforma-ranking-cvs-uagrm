<?php

namespace App\InterfaceAdapters\Gateways;

use Aws\DynamoDb\Marshaler;

final class DynamoItemMapper
{
    private readonly Marshaler $marshaler;

    public function __construct()
    {
        $this->marshaler = new Marshaler();
    }

    public function encode(array $item): array
    {
        return $this->marshaler->marshalItem($item);
    }

    public function decode(array $item): array
    {
        return $this->marshaler->unmarshalItem($item);
    }
}
