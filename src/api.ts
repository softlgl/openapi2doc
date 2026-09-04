// 与后端 /api/docs 交互的类型化客户端
export interface DocMeta {
  id: number
  name: string
  group: string
  tags: string[]
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface DocDetail extends DocMeta {
  source: string
}

export interface DocInput {
  name: string
  group?: string
  tags?: string[]
  description?: string
  source: string
}

export interface GroupMeta {
  id: number
  name: string
  sortOrder: number
  docCount: number
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (data && (data as { message?: string }).message) || `请求失败 (${res.status})`
    throw new Error(msg)
  }
  return data as T
}

export function listDocs(params?: { group?: string; q?: string }): Promise<DocMeta[]> {
  const query = new URLSearchParams()
  if (params?.group) query.set('group', params.group)
  if (params?.q) query.set('q', params.q)
  const qs = query.toString()
  return request<DocMeta[]>(`/api/docs${qs ? `?${qs}` : ''}`)
}

export function listGroups(): Promise<GroupMeta[]> {
  return request<GroupMeta[]>('/api/groups')
}

export function createGroup(name: string): Promise<GroupMeta> {
  return request<GroupMeta>('/api/groups', { method: 'POST', body: JSON.stringify({ name }) })
}

export function renameGroup(id: number, name: string): Promise<{ id: number; name: string }> {
  return request<{ id: number; name: string }>(`/api/groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

export function deleteGroup(id: number): Promise<{ deleted: number }> {
  return request<{ deleted: number }>(`/api/groups/${id}`, { method: 'DELETE' })
}

export function reorderGroups(items: Array<{ id: number; sortOrder: number }>): Promise<{ updated: number }> {
  return request<{ updated: number }>('/api/groups/order', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  })
}

export function getDoc(id: number): Promise<DocDetail> {
  return request<DocDetail>(`/api/docs/${id}`)
}

export function createDoc(input: DocInput): Promise<{ id: number }> {
  return request<{ id: number }>('/api/docs', { method: 'POST', body: JSON.stringify(input) })
}

export function updateDoc(id: number, input: Partial<DocInput>): Promise<{ id: number }> {
  return request<{ id: number }>(`/api/docs/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteDoc(id: number): Promise<{ id: number }> {
  return request<{ id: number }>(`/api/docs/${id}`, { method: 'DELETE' })
}

export function bulkMove(ids: number[], group: string): Promise<{ moved: number; group: string }> {
  return request<{ moved: number; group: string }>('/api/docs/bulk-move', {
    method: 'POST',
    body: JSON.stringify({ ids, group }),
  })
}

export function bulkDelete(ids: number[]): Promise<{ deleted: number }> {
  return request<{ deleted: number }>('/api/docs/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}