import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { CurriculumRepositoryPort } from '../../../../application/ports/out/curriculum-repository.port';
import { CURRICULUM_REPOSITORY } from '../../../tokens';

@Controller('mcp')
export class McpController {
  constructor(@Inject(CURRICULUM_REPOSITORY) private readonly curricula: CurriculumRepositoryPort) {}

  @Get('resources')
  resources() {
    return {
      resources: [],
      resourceTemplates: [{
        uriTemplate: 'cv://{resumeId}',
        name: 'curriculum_vitae',
        description: 'Expediente documental y datos extraídos de un CV',
        mimeType: 'application/json',
      }],
    };
  }

  @Get('resources/cvs/:id')
  async getCvResource(@Param('id') id: string) {
    const document = await this.curricula.findById(id);
    if (!document) throw new NotFoundException(`CV ${id} no encontrado`);
    return { uri: `cv://${id}`, mimeType: 'application/json', contents: document };
  }

  @Get('tools')
  tools() {
    return {
      tools: [{
        name: 'buscar_candidatos_historicos_afines',
        description: 'Busca candidatos históricos no bloqueados que coincidan con habilidades requeridas',
        inputSchema: {
          type: 'object',
          properties: {
            skills: { type: 'array', items: { type: 'string' } },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          required: ['skills'],
        },
      }],
    };
  }

  @Post('execute')
  async executeTool(@Body() body: { name?: string; arguments?: { skills?: string[]; limit?: number } }) {
    if (body.name !== 'buscar_candidatos_historicos_afines') {
      throw new BadRequestException(`Herramienta MCP no soportada: ${String(body.name)}`);
    }
    const candidates = await this.search(body.arguments || {});
    return { content: [{ type: 'json', json: { candidates } }], isError: false };
  }

  @Post('tools/buscar_candidatos_historicos_afines')
  async findRelatedCandidates(@Body() body: { skills?: string[]; limit?: number }) {
    return { candidates: await this.search(body) };
  }

  private async search(body: { skills?: string[]; limit?: number }) {
    if (!Array.isArray(body.skills) || body.skills.some((skill) => typeof skill !== 'string')) {
      throw new BadRequestException('skills debe ser una lista de texto');
    }
    return this.curricula.searchBySkills(body.skills, body.limit || 20);
  }
}
