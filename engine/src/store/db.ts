import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Хранилище на записи - едно JSON файлче на колекция.
 *
 * Тук някога стоеше base44: колекциите бяха негови "entities", а всяка заявка
 * минаваше през чужд сървър. Сега файловете са локални и проектът тръгва без
 * акаунт никъде.
 *
 * Защо JSON, а не база данни: обемът е малък (сделки, поръчки, дневници), а
 * най-важното качество тук е записът да не се разваля при спиране по средата.
 * Затова се пише във временен файл и се преименува - преименуването е атомарно
 * на едно и също устройство, тоест файлът е или стар, или нов, но никога
 * половин.
 */

export interface Record_ {
  id: string;
  created_date: string;
  updated_date: string;
  created_by: string;
  [key: string]: unknown;
}

export type Filter = Record<string, unknown>;

export interface ListOptions {
  /** Поле за подредба; с "-" отпред за низходящо, както беше в стария код. */
  sort?: string;
  limit?: number;
  offset?: number;
}

function matches(record: Record_, filter: Filter): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    const actual = record[key];

    // {$in: [...]} и {$gte: x} - малкото подмножество, което старият код ползва.
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const ops = expected as Record<string, unknown>;
      if ('$in' in ops && Array.isArray(ops.$in) && !ops.$in.includes(actual)) return false;
      if ('$gte' in ops && !(Number(actual) >= Number(ops.$gte))) return false;
      if ('$lte' in ops && !(Number(actual) <= Number(ops.$lte))) return false;
      if ('$gt' in ops && !(Number(actual) > Number(ops.$gt))) return false;
      if ('$lt' in ops && !(Number(actual) < Number(ops.$lt))) return false;
      if ('$ne' in ops && actual === ops.$ne) return false;
      continue;
    }

    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
      continue;
    }

    if (actual !== expected) return false;
  }
  return true;
}

function compare(a: Record_, b: Record_, sort: string): number {
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const av = a[key];
  const bv = b[key];
  let result: number;
  if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
  else result = String(av ?? '').localeCompare(String(bv ?? ''));
  return desc ? -result : result;
}

export class Collection {
  private readonly file: string;
  private rows: Record_[];
  private dirty = false;

  constructor(
    private readonly dir: string,
    readonly name: string
  ) {
    this.file = join(dir, `${name}.json`);
    this.rows = this.read();
  }

  private read(): Record_[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      // Развален файл не бива да бъде мълчаливо изтрит - това са сделки.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      renameSync(this.file, backup);
      throw new Error(
        `${this.name}.json е нечетим и беше запазен като ${backup}: ${(error as Error).message}`
      );
    }
  }

  private flush(): void {
    if (!this.dirty) return;
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.rows, null, 2), 'utf8');
    renameSync(tmp, this.file);
    this.dirty = false;
  }

  async list(sortOrOptions?: string | ListOptions, limit?: number): Promise<Record_[]> {
    const options: ListOptions =
      typeof sortOrOptions === 'string' ? { sort: sortOrOptions, limit } : (sortOrOptions ?? {});
    let out = [...this.rows];
    if (options.sort) out.sort((a, b) => compare(a, b, options.sort!));
    if (options.offset) out = out.slice(options.offset);
    if (options.limit) out = out.slice(0, options.limit);
    return out;
  }

  async filter(
    filter: Filter,
    sortOrOptions?: string | ListOptions,
    limit?: number
  ): Promise<Record_[]> {
    const options: ListOptions =
      typeof sortOrOptions === 'string' ? { sort: sortOrOptions, limit } : (sortOrOptions ?? {});
    let out = this.rows.filter((row) => matches(row, filter));
    if (options.sort) out.sort((a, b) => compare(a, b, options.sort!));
    if (options.offset) out = out.slice(options.offset);
    if (options.limit) out = out.slice(0, options.limit);
    return out;
  }

  async get(id: string): Promise<Record_ | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async create(data: Record<string, unknown>, createdBy = 'local'): Promise<Record_> {
    const now = new Date().toISOString();
    const row: Record_ = {
      ...data,
      id: (data.id as string) ?? randomUUID(),
      created_date: (data.created_date as string) ?? now,
      updated_date: now,
      created_by: (data.created_by as string) ?? createdBy,
    };
    this.rows.push(row);
    this.dirty = true;
    this.flush();
    return row;
  }

  async bulkCreate(items: Record<string, unknown>[], createdBy = 'local'): Promise<Record_[]> {
    const out: Record_[] = [];
    for (const item of items) out.push(await this.create(item, createdBy));
    return out;
  }

  async update(id: string, patch: Record<string, unknown>): Promise<Record_> {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index === -1) throw new Error(`${this.name}: няма запис с id=${id}`);
    const updated: Record_ = {
      ...this.rows[index]!,
      ...patch,
      id,
      updated_date: new Date().toISOString(),
    };
    this.rows[index] = updated;
    this.dirty = true;
    this.flush();
    return updated;
  }

  async delete(id: string): Promise<void> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.id !== id);
    if (this.rows.length !== before) {
      this.dirty = true;
      this.flush();
    }
  }
}

export class Database {
  private readonly collections = new Map<string, Collection>();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  collection(name: string): Collection {
    let existing = this.collections.get(name);
    if (!existing) {
      existing = new Collection(this.dir, name);
      this.collections.set(name, existing);
    }
    return existing;
  }

  /** Стабилен идентификатор за идемпотентност на поръчки. */
  static idempotencyKey(parts: unknown[]): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
  }
}
