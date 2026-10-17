<?php

namespace Tests\Unit;

use App\InterfaceAdapters\Gateways\ProtoWireCodec;
use PHPUnit\Framework\TestCase;

final class ProtoWireCodecTest extends TestCase
{
    public function test_encodes_and_decodes_proto_fields_used_by_vacancy_gateway(): void
    {
        $message = ProtoWireCodec::string(1, 'saga-1')
            .ProtoWireCodec::string(2, 'vacancy-1')
            .ProtoWireCodec::varintField(3, 2);
        $fields = ProtoWireCodec::fields($message);

        self::assertSame('saga-1', $fields[1][0]);
        self::assertSame('vacancy-1', $fields[2][0]);
        self::assertSame(2, $fields[3][0]);
    }
}
