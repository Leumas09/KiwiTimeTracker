import type {
  Category,
  CategoryInput,
  DateRange,
  EntryPatch,
  NewEntry,
  Profile,
  Project,
  ProjectInput,
  Tag,
  TimeEntry,
} from '../lib/types'

export interface StartTimerInput {
  projectId: string | null
  description: string
  tagIds: string[]
  start?: Date
}

/** Everything the UI needs from storage. Implemented by Supabase and by the local demo. */
export interface DataApi {
  getProfile(): Promise<Profile>
  updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<Profile>

  listCategories(): Promise<Category[]>
  createCategory(input: CategoryInput): Promise<Category>
  updateCategory(id: string, patch: Partial<CategoryInput>): Promise<Category>
  deleteCategory(id: string): Promise<void>

  listProjects(): Promise<Project[]>
  createProject(input: ProjectInput): Promise<Project>
  updateProject(id: string, patch: Partial<ProjectInput>): Promise<Project>
  deleteProject(id: string): Promise<void>

  listTags(): Promise<Tag[]>
  createTag(name: string): Promise<Tag>
  updateTag(id: string, name: string): Promise<Tag>
  deleteTag(id: string): Promise<void>

  /** Entries that start inside the range, newest first. Null range = all entries. */
  listEntries(range: DateRange | null): Promise<TimeEntry[]>
  getRunningEntry(): Promise<TimeEntry | null>
  createEntry(input: NewEntry): Promise<TimeEntry>
  updateEntry(id: string, patch: EntryPatch): Promise<TimeEntry>
  deleteEntry(id: string): Promise<void>
  /** Stops the running entry, if any, and starts a new one. */
  startTimer(input: StartTimerInput): Promise<TimeEntry>
  stopTimer(id: string, end?: Date): Promise<TimeEntry>

  /** Calls back when data changed elsewhere (other tab or device). */
  subscribe(onChange: (table: Table) => void): () => void
}

export type Table = 'profiles' | 'categories' | 'projects' | 'tags' | 'time_entries'
