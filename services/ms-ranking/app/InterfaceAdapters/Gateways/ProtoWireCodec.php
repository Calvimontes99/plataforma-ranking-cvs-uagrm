<?php

namespace App\InterfaceAdapters\Gateways;

final class ProtoWireCodec
{
    public static function string(int $field, string $value): string
    {
        return $value === '' ? '' : self::varint(($field << 3) | 2).self::varint(strlen($value)).$value;
    }

    public static function message(int $field, string $message): string
    {
        return self::varint(($field << 3) | 2).self::varint(strlen($message)).$message;
    }

    public static function varintField(int $field, int $value): string
    {
        return self::varint($field << 3).self::varint($value);
    }

    public static function varint(int $value): string
    {
        $result = '';
        while ($value > 0x7f) {
            $result .= chr(($value & 0x7f) | 0x80);
            $value >>= 7;
        }
        return $result.chr($value);
    }

    public static function fields(string $bytes): array
    {
        $fields = [];
        $offset = 0;
        $length = strlen($bytes);
        while ($offset < $length) {
            $tag = self::readVarint($bytes, $offset);
            $field = $tag >> 3;
            $wire = $tag & 7;
            if ($field === 0) throw new \UnexpectedValueException('Respuesta Protobuf inválida');
            if ($wire === 0) {
                $fields[$field][] = self::readVarint($bytes, $offset);
            } elseif ($wire === 1) {
                $fields[$field][] = substr($bytes, $offset, 8);
                $offset += 8;
            } elseif ($wire === 2) {
                $size = self::readVarint($bytes, $offset);
                $fields[$field][] = substr($bytes, $offset, $size);
                $offset += $size;
            } elseif ($wire === 5) {
                $fields[$field][] = substr($bytes, $offset, 4);
                $offset += 4;
            } else {
                throw new \UnexpectedValueException('Wire type Protobuf no soportado');
            }
            if ($offset > $length) throw new \UnexpectedValueException('Respuesta Protobuf truncada');
        }
        return $fields;
    }

    private static function readVarint(string $bytes, int &$offset): int
    {
        $value = 0;
        $shift = 0;
        do {
            if ($offset >= strlen($bytes) || $shift > 63) {
                throw new \UnexpectedValueException('Varint Protobuf inválido');
            }
            $byte = ord($bytes[$offset++]);
            $value |= ($byte & 0x7f) << $shift;
            $shift += 7;
        } while (($byte & 0x80) !== 0);
        return $value;
    }
}
