// src/lib/childDocuments.ts
// Документы ребёнка — ОДИН список из трёх источников.
//
// ТРИ ИСТОЧНИКА, ОДИН СПИСОК (канон владельца 01.08 + 04.08):
//   paper     — бумага в деле. Файла НЕТ и не будет; строка полноценна.
//   uploaded  — приложенный скан/фото. Файл есть → Download и Print.
//   generated — созданное системой. Файл есть → Download и Print.
// Раньше вкладка показывала не эти строки, а СОДЕРЖИМОЕ ХРАНИЛИЩА: файлы без
// типа, без документной даты и без связи с ребёнком в базе. Поэтому бумага в
// ней не показывалась вовсе, а у скана нельзя было спросить «что это и от
// какого числа».
//
// ПОЧЕМУ НЕ БЫЛО АВТОБЭКФИЛЛА (решение владельца 04.08). Файлы, уже лежащие в
// хранилище, типа и документной даты не несут — угадать их может только человек,
// открыв файл. Проставить их машиной значит записать выдумку в клеймовый
// контур. Такие файлы живут отдельной секцией «Unfiled uploads», и каждый
// разносится вручную кнопкой File it.

import { supabase } from '@/lib/supabase'
import { warnIf } from '@/lib/queryError'

export const CHILD_DOCS_BUCKET = 'org-files'

export type DocSource = 'paper' | 'uploaded' | 'generated'

export interface ChildDocRow {
  id: string
  doc_type: string
  title: string | null
  source: DocSource
  storage_path: string | null
  valid_from: string | null
  valid_until: string | null
  attested_at: string | null
  status: string
  created_at: string
  notes: string | null
}

export interface DocTypeRow { code: string; name: string; category: string | null }

/** Есть ли у строки файл, который можно скачать и напечатать. */
export function hasFile(d: Pick<ChildDocRow, 'source' | 'storage_path'>): boolean {
  return d.source !== 'paper' && !!d.storage_path
}

/**
 * Порядок списка — ПО ДОКУМЕНТНОЙ ДАТЕ, новые сверху.
 *
 * Не по дате загрузки: бумага, подписанная в июне и внесённая в августе, обязана
 * стоять там, где ей место по СВОЕЙ дате, иначе список читается как хроника
 * работы оператора, а не как дело ребёнка. Строки без документной даты
 * (исторические) уходят вниз — не наверх: наверху они выдавали бы себя за самое
 * свежее.
 */
export function sortByDocumentDate(rows: readonly ChildDocRow[]): ChildDocRow[] {
  return [...rows].sort((a, b) => {
    const da = a.valid_from ?? ''
    const db = b.valid_from ?? ''
    if (da !== db) {
      if (!da) return 1
      if (!db) return -1
      return da < db ? 1 : -1
    }
    return (a.created_at < b.created_at) ? 1 : -1
  })
}

/**
 * Файлы хранилища, у которых НЕТ строки в documents. Сравнение по полному пути:
 * имя файла не уникально между детьми, а путь уникален.
 */
export function unfiledNames(
  storageNames: readonly string[], dir: string, rows: readonly ChildDocRow[],
): string[] {
  const filed = new Set(rows.map(r => r.storage_path).filter(Boolean) as string[])
  return storageNames.filter(n => !filed.has(`${dir}/${n}`))
}

export async function loadDocTypes(): Promise<DocTypeRow[]> {
  const { data, error } = await supabase.schema('menumaker').from('document_types')
    .select('code,name,category').eq('active', true).order('sort_order')
  // Реестр не прочитан — раскладывать документы не по чему. Молчать нельзя:
  // пустой выпадающий список читается как «типов не бывает».
  if (warnIf(error, 'childDocuments/document_types')) return []
  return (data ?? []) as DocTypeRow[]
}

export async function loadChildDocs(rosterId: string): Promise<ChildDocRow[]> {
  const { data, error } = await supabase.schema('menumaker').from('documents')
    .select('id,doc_type,title,source,storage_path,valid_from,valid_until,attested_at,status,created_at,notes')
    .eq('roster_id', rosterId).eq('status', 'active')
  if (warnIf(error, 'childDocuments/documents')) return []
  return sortByDocumentDate((data ?? []) as ChildDocRow[])
}

export interface FileItInput {
  orgId: string; centerId: string | null; rosterId: string
  docType: string; documentDate: string; storagePath: string; title?: string | null
}

/** Завести строку для файла: тип + документная дата + путь. */
export async function fileUploadedDoc(i: FileItInput): Promise<string | null> {
  const { error } = await supabase.schema('menumaker').from('documents').insert({
    org_id: i.orgId, center_id: i.centerId, doc_type: i.docType,
    title: i.title ?? null, roster_id: i.rosterId,
    source: 'uploaded', storage_path: i.storagePath,
    valid_from: i.documentDate, status: 'active',
  })
  return error ? error.message : null
}
