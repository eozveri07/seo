import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ProjectsService } from '../clients/projects.service';
import {
  BULK_ADD_MAX_LINES,
  BulkAddKeywordsDto,
} from './dto/bulk-add-keywords.dto';
import { BulkAddKeywordsErrorDto } from './dto/bulk-add-keywords-response.dto';
import { KeywordGroup } from './entities/keyword-group.entity';
import {
  TrackedKeyword,
  TrackedKeywordDevice,
} from './entities/tracked-keyword.entity';
import { resolveLocationLanguage } from './keyword-location-defaults';
import { KeywordVolumeJobsService } from './keyword-volume-jobs.service';
import { TooManyKeywordsError } from './keywords.errors';
import { normalizeKeyword } from './normalize-keyword';

export interface BulkAddKeywordsResult {
  added: number;
  skipped: number;
  errors: BulkAddKeywordsErrorDto[];
}

interface ParsedLine {
  lineNumber: number;
  keyword: string;
  keywordNormalized: string;
  groupName: string | null;
  device: TrackedKeywordDevice;
  targetUrl: string | null;
}

const DEVICE_VALUES = new Set<string>(Object.values(TrackedKeywordDevice));

/**
 * `POST /projects/:id/keywords/bulk` (PLAN T1.8): metin ya da CSV satırlarını
 * ayrıştırır, normalize eder, istek içi ve DB'deki tekrarları atlar, eksik
 * grupları oluşturur ve hepsini tek transaction'da ekler.
 */
@Injectable()
export class KeywordsBulkService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly projectsService: ProjectsService,
    private readonly keywordVolumeJobs: KeywordVolumeJobsService,
    private readonly audit: AuditService,
  ) {}

  async bulkAdd(
    orgId: string,
    projectId: string,
    dto: BulkAddKeywordsDto,
  ): Promise<BulkAddKeywordsResult> {
    const project = await this.projectsService.findOne(projectId);
    const lines = dto.text.split(/\r\n|\r|\n/);
    const nonEmptyCount = lines.filter((line) => line.trim().length > 0).length;
    if (nonEmptyCount > BULK_ADD_MAX_LINES) {
      throw new TooManyKeywordsError(BULK_ADD_MAX_LINES);
    }

    const errors: BulkAddKeywordsErrorDto[] = [];
    const parsed: ParsedLine[] = [];
    const seenInRequest = new Map<string, number>();

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) {
        return;
      }
      const lineNumber = index + 1;
      const row = parseLine(line, dto);
      if (!row.keyword) {
        errors.push({ line: lineNumber, message: 'Keyword boş olamaz.' });
        return;
      }
      if (row.device && !DEVICE_VALUES.has(row.device)) {
        errors.push({
          line: lineNumber,
          message: `Geçersiz cihaz: ${row.device}.`,
        });
        return;
      }
      const keywordNormalized = normalizeKeyword(row.keyword);
      const device =
        (row.device as TrackedKeywordDevice) ??
        dto.defaultDevice ??
        TrackedKeywordDevice.Desktop;
      const dedupeKey = `${keywordNormalized}|${device}`;
      const firstLine = seenInRequest.get(dedupeKey);
      if (firstLine !== undefined) {
        errors.push({
          line: lineNumber,
          message: `İstek içinde tekrar (satır ${firstLine} ile aynı).`,
        });
        return;
      }
      seenInRequest.set(dedupeKey, lineNumber);
      parsed.push({
        lineNumber,
        keyword: row.keyword,
        keywordNormalized,
        groupName: row.groupName ?? dto.defaultGroupName ?? null,
        device,
        targetUrl: row.targetUrl ?? null,
      });
    });

    if (parsed.length === 0) {
      return { added: 0, skipped: errors.length, errors };
    }

    const { locationCode, languageCode } = resolveLocationLanguage(project);
    const added = await this.dataSource.transaction(async (manager) => {
      const existing = await manager
        .getRepository(TrackedKeyword)
        .createQueryBuilder('keyword')
        .select(['keyword.keywordNormalized', 'keyword.device'])
        .where('keyword.project_id = :projectId', { projectId })
        .andWhere('keyword.location_code = :locationCode', { locationCode })
        .andWhere('keyword.language_code = :languageCode', { languageCode })
        .getMany();
      const existingKeys = new Set(
        existing.map((row) => `${row.keywordNormalized}|${row.device}`),
      );

      const groupCache = new Map<string, string>();
      const groupRepository = manager.getRepository(KeywordGroup);
      let addedCount = 0;

      for (const row of parsed) {
        const dedupeKey = `${row.keywordNormalized}|${row.device}`;
        if (existingKeys.has(dedupeKey)) {
          errors.push({
            line: row.lineNumber,
            message: 'Bu keyword zaten takip ediliyor.',
          });
          continue;
        }

        let groupId: string | null = null;
        if (row.groupName) {
          groupId = groupCache.get(row.groupName) ?? null;
          if (!groupId) {
            const foundOrCreated = await findOrCreateGroup(
              groupRepository,
              orgId,
              projectId,
              row.groupName,
            );
            groupId = foundOrCreated.id;
            groupCache.set(row.groupName, groupId);
          }
        }

        await manager.getRepository(TrackedKeyword).insert({
          orgId,
          projectId,
          groupId,
          keyword: row.keyword,
          keywordNormalized: row.keywordNormalized,
          device: row.device,
          locationCode,
          languageCode,
          targetUrl: row.targetUrl,
        });
        existingKeys.add(dedupeKey);
        addedCount += 1;
      }
      return addedCount;
    });

    if (added > 0) {
      await this.audit.record({
        action: AuditAction.KeywordsBulkAdded,
        entityType: 'tracked_keyword',
        changes: { projectId, added },
      });
      await this.keywordVolumeJobs.enqueueManual(orgId, projectId);
    }

    return {
      added,
      skipped: errors.length,
      errors: errors.sort((a, b) => a.line - b.line),
    };
  }
}

/** Satır bir virgül içeriyorsa CSV (`keyword,grup,cihaz,hedef url`), yoksa düz metin. */
function parseLine(
  line: string,
  dto: BulkAddKeywordsDto,
): {
  keyword: string;
  groupName?: string;
  device?: string;
  targetUrl?: string;
} {
  if (!line.includes(',')) {
    return { keyword: line };
  }
  const columns = splitCsvLine(line).map((column) => column.trim());
  const [keyword, groupName, device, targetUrl] = columns;
  return {
    keyword: keyword ?? '',
    groupName: groupName || undefined,
    device: device || dto.defaultDevice,
    targetUrl: targetUrl || undefined,
  };
}

/** RFC4180'in basit bir alt kümesi: çift tırnaklı alanlar, kaçışlı `""`. */
function splitCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      columns.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  columns.push(current);
  return columns;
}

async function findOrCreateGroup(
  groupRepository: Repository<KeywordGroup>,
  orgId: string,
  projectId: string,
  name: string,
): Promise<KeywordGroup> {
  const trimmed = name.trim();
  const existing = await groupRepository.findOneBy({
    projectId,
    name: trimmed,
  });
  if (existing) {
    return existing;
  }
  return groupRepository.save({
    orgId,
    projectId,
    name: trimmed,
    color: null,
  });
}
