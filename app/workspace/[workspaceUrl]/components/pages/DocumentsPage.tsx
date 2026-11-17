'use client'

import { MemberAvatar } from '@/components/MemberAvatar'
import { useMemo, useState } from 'react'
import { useIntl } from 'react-intl'
import { Card } from '@/components/ui/card'
import { Plus, MoreHorizontal, Trash2, Link } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AsyncContent } from '../AsyncContent'
import {
  DOCUMENT_CARD_CLASS,
  DOCUMENT_GRID_CLASS,
  DocumentGridSkeleton,
  DocumentListSkeleton,
} from '../skeletons/DocumentSkeletons'
import { ApiDocument, DocVisibility } from '../../types'
import { TagList } from '../document/TagBadge'
import { TagListNew } from '../document/TagPicker'
import { CollaboratorAvatars } from '../document/CollaboratorAvatars'
import { ViewToggle } from '../ViewToggle'
import { PageBreadcrumb } from '../PageBreadcrumb'
import { SearchInput } from '../SearchInput'
import { CACHE_KEY } from '../../constants'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/datetime/relative'

interface DocumentsPageProps {
  documents: ApiDocument[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onNewDocument: () => void
  onSelectDocument: (doc: ApiDocument) => void
  onDeleteDocument: (id: string) => void
  /** Copy the document's URL — the page doesn't know the workspace route. */
  onCopyLink: (doc: ApiDocument) => void
}

const FILTERS: { key: DocVisibility | 'ALL'; msgId: string }[] = [
  { key: 'ALL', msgId: 'documents.filterAll' },
  { key: 'PRIVATE', msgId: 'documents.filterPersonal' },
  { key: 'SHARED', msgId: 'documents.filterShared' },
  { key: 'WORKSPACE', msgId: 'documents.filterWorkspace' },
]

/**
 * One column template shared by the header and every row, so cells line up
 * whatever their content: title · tags · creator · collaborators · updated ·
 * menu. Narrower viewports drop tags/collaborators, then creator.
 */
const LIST_GRID_CLASS =
  'grid items-center gap-x-4 px-3 grid-cols-[minmax(0,1fr)_6.5rem_1.5rem] lg:grid-cols-[minmax(0,1fr)_10rem_6.5rem_1.5rem] xl:grid-cols-[minmax(0,1fr)_11rem_12rem_4.5rem_6.5rem_1.5rem]'

const OPEN_BUTTON_CLASS =
  'block max-w-full truncate text-left text-body-strong outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring'

type SortKey = 'updatedAt' | 'createdAt' | 'title'

function sortDocuments(docs: ApiDocument[], sortBy: SortKey): ApiDocument[] {
  return [...docs].sort((a, b) => {
    switch (sortBy) {
      case 'updatedAt':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      case 'createdAt':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case 'title':
        return a.title.localeCompare(b.title)
    }
  })
}

export function DocumentsPage({
  documents,
  loading,
  error,
  onRetry,
  onNewDocument,
  onSelectDocument,
  onDeleteDocument,
  onCopyLink,
}: DocumentsPageProps) {
  const intl = useIntl()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<DocVisibility | 'ALL'>('ALL')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'board'>(() => {
    if (typeof window === 'undefined') return 'list'
    // Migrate the pre-board cache value: anyone with 'table' stored gets the
    // board view that replaced it. Unknown values fall back to 'list'.
    const stored = localStorage.getItem(CACHE_KEY.docViewMode)
    if (stored === 'board' || stored === 'table') return 'board'
    return 'list'
  })
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    if (typeof window === 'undefined') return 'updatedAt'
    return (localStorage.getItem(CACHE_KEY.docSort) as SortKey) || 'updatedAt'
  })

  const filtered = useMemo(() => {
    let result = documents
    if (filter !== 'ALL') {
      result = result.filter(d => d.visibility === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(d => d.title.toLowerCase().includes(q))
    }
    return result
  }, [documents, filter, search])

  const sorted = useMemo(
    () => sortDocuments(filtered, sortBy),
    [filtered, sortBy]
  )

  function handleSetViewMode(mode: 'list' | 'board') {
    setViewMode(mode)
    localStorage.setItem(CACHE_KEY.docViewMode, mode)
  }

  function handleSetSortBy(key: SortKey) {
    setSortBy(key)
    localStorage.setItem(CACHE_KEY.docSort, key)
  }

  /** Where the document lives: its project, else its visibility scope. */
  function getSubtitle(doc: ApiDocument): string {
    if (doc.project) return doc.project.name
    if (doc.visibility === 'PRIVATE')
      return intl.formatMessage({ id: 'documents.filterPersonal' })
    if (doc.visibility === 'SHARED')
      return intl.formatMessage({ id: 'documents.filterShared' })
    return intl.formatMessage({ id: 'documents.filterWorkspace' })
  }

  function getTitle(doc: ApiDocument): string {
    return (
      doc.title ||
      intl.formatMessage({
        id: 'documents.untitled',
        defaultMessage: 'Untitled',
      })
    )
  }

  function renderTags(doc: ApiDocument) {
    if (doc.docTags && doc.docTags.length > 0)
      return <TagListNew tags={doc.docTags} max={2} />
    if (doc.tags && doc.tags.length > 0)
      return <TagList tags={doc.tags} max={2} />
    return null
  }

  // The title button stretches over the whole row/card (`after:inset-0`), so
  // the row opens by mouse and by keyboard without nesting the menu inside
  // another control. The menu sits above it (`relative z-10`).
  function renderOpenButton(doc: ApiDocument, className?: string) {
    return (
      <button
        type='button'
        className={cn(OPEN_BUTTON_CLASS, className)}
        onClick={() => onSelectDocument(doc)}
      >
        {getTitle(doc)}
      </button>
    )
  }

  function renderRowMenu(doc: ApiDocument) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            aria-label={intl.formatMessage({ id: 'common.moreActions' })}
            className='relative z-10 size-6 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100'
          >
            <MoreHorizontal className='size-3.5' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => onCopyLink(doc)}>
            <Link className='size-3.5 mr-2' />
            {intl.formatMessage({ id: 'documents.copyLink' })}
          </DropdownMenuItem>
          <DropdownMenuItem
            className='text-danger-text'
            onClick={() => setDeleteId(doc.id)}
          >
            <Trash2 className='size-3.5 mr-2' />
            {intl.formatMessage({ id: 'documents.delete' })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function renderListView() {
    return (
      <div role='table' className='pb-4'>
        <div role='rowgroup'>
          <div
            role='row'
            className={cn(
              LIST_GRID_CLASS,
              'border-b border-border py-2 text-caption text-muted-foreground'
            )}
          >
            <span role='columnheader'>
              {intl.formatMessage({ id: 'documents.colName' })}
            </span>
            <span role='columnheader' className='hidden xl:block'>
              {intl.formatMessage({ id: 'documents.colTags' })}
            </span>
            <span role='columnheader' className='hidden lg:block'>
              {intl.formatMessage({ id: 'documents.colCreator' })}
            </span>
            <span role='columnheader' className='hidden xl:block'>
              {intl.formatMessage({ id: 'documents.colCollaborators' })}
            </span>
            <span role='columnheader' className='text-right'>
              {intl.formatMessage({ id: 'documents.colUpdatedAt' })}
            </span>
            <span role='columnheader'>
              <span className='sr-only'>
                {intl.formatMessage({ id: 'common.moreActions' })}
              </span>
            </span>
          </div>
        </div>
        <div role='rowgroup' className='divide-y divide-border'>
          {sorted.map(doc => (
            <div
              key={doc.id}
              role='row'
              className={cn(
                LIST_GRID_CLASS,
                'group relative py-2.5 transition-colors hover:bg-muted/50'
              )}
            >
              <div role='cell' className='flex min-w-0 items-center gap-3'>
                <span aria-hidden className='shrink-0 text-title'>
                  {doc.emoji ?? '📄'}
                </span>
                <div className='min-w-0 flex-1'>
                  {renderOpenButton(doc)}
                  <div className='truncate text-caption text-muted-foreground'>
                    {getSubtitle(doc)}
                  </div>
                </div>
              </div>
              <div
                role='cell'
                className='hidden min-w-0 overflow-hidden xl:block'
              >
                {renderTags(doc)}
              </div>
              <div
                role='cell'
                className='hidden min-w-0 items-center gap-1.5 lg:flex'
              >
                <MemberAvatar
                  decorative
                  name={doc.createdBy.name}
                  imageUrl={doc.createdBy.imageUrl}
                  size='xs'
                />
                <span className='truncate text-caption text-muted-foreground'>
                  {doc.createdBy.name}
                </span>
              </div>
              <div role='cell' className='hidden xl:block'>
                {doc.editors && doc.editors.length > 0 && (
                  <CollaboratorAvatars editors={doc.editors} max={3} />
                )}
              </div>
              <span
                role='cell'
                className='whitespace-nowrap text-right text-caption tabular-nums text-muted-foreground'
              >
                {formatRelativeTime(doc.updatedAt, intl.locale)}
              </span>
              <div role='cell' className='flex justify-end'>
                {renderRowMenu(doc)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderBoardView() {
    return (
      <div className={DOCUMENT_GRID_CLASS}>
        {sorted.map(doc => (
          <Card
            key={doc.id}
            className={cn(
              DOCUMENT_CARD_CLASS,
              'group relative transition-colors hover:bg-muted/50'
            )}
          >
            <div className='flex items-start justify-between gap-2'>
              <div className='flex min-w-0 items-center gap-2'>
                <span aria-hidden className='shrink-0 text-title'>
                  {doc.emoji ?? '📄'}
                </span>
                {renderOpenButton(doc, 'after:rounded-lg')}
              </div>
              {renderRowMenu(doc)}
            </div>
            <div className='mt-2 flex-1 overflow-hidden text-caption text-muted-foreground whitespace-pre-line line-clamp-3'>
              {doc.preview ?? ''}
            </div>
            <div className='mt-3 flex items-center gap-2'>
              <MemberAvatar
                name={doc.createdBy.name}
                imageUrl={doc.createdBy.imageUrl}
                size='xs'
              />
              <span className='min-w-0 flex-1 truncate text-caption text-muted-foreground'>
                {getSubtitle(doc)}
                {' · '}
                {formatRelativeTime(doc.updatedAt, intl.locale)}
              </span>
              <div className='shrink-0'>{renderTags(doc)}</div>
            </div>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className='flex-1 flex flex-col overflow-hidden'>
      <PageBreadcrumb
        title={intl.formatMessage({ id: 'sidebar.documents' })}
        actions={
          <div className='flex items-center gap-2'>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={intl.formatMessage({ id: 'documents.search' })}
              className='w-48'
            />
            <ViewToggle value={viewMode} onChange={handleSetViewMode} />
            <Button size='sm' onClick={onNewDocument} className='gap-1.5'>
              <Plus size={14} />
              {intl.formatMessage({ id: 'documents.newDocument' })}
            </Button>
          </div>
        }
      />

      <div className='mx-auto w-full max-w-[1680px] px-4 md:px-8 pt-4 pb-4 flex items-center gap-2 shrink-0'>
        {FILTERS.map(f => (
          <button
            key={f.key}
            type='button'
            className={cn(
              'px-3 py-1 text-caption rounded-md transition-colors',
              filter === f.key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setFilter(f.key)}
          >
            {intl.formatMessage({ id: f.msgId })}
          </button>
        ))}

        <div className='ml-auto'>
          <Select
            value={sortBy}
            onValueChange={(v: string) => handleSetSortBy(v as SortKey)}
          >
            <SelectTrigger className='h-8 w-36 text-caption'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='updatedAt'>
                {intl.formatMessage({ id: 'documents.sortUpdated' })}
              </SelectItem>
              <SelectItem value='createdAt'>
                {intl.formatMessage({ id: 'documents.sortCreated' })}
              </SelectItem>
              <SelectItem value='title'>
                {intl.formatMessage({ id: 'documents.sortTitle' })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto'>
        <div className='mx-auto w-full max-w-[1680px] px-4 md:px-8'>
          <AsyncContent
            loading={loading}
            error={error}
            onRetry={onRetry}
            loadingState={
              viewMode === 'list' ? (
                <DocumentListSkeleton />
              ) : (
                <DocumentGridSkeleton />
              )
            }
            empty={sorted.length === 0}
            emptyState={
              <Empty>
                <EmptyHeader>
                  <EmptyDescription>
                    {intl.formatMessage({
                      id:
                        search || filter !== 'ALL'
                          ? 'documents.emptyFiltered'
                          : 'documents.empty',
                    })}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
          >
            {viewMode === 'list' ? renderListView() : renderBoardView()}
          </AsyncContent>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {intl.formatMessage({ id: 'documents.delete' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage({ id: 'documents.deleteConfirm' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {intl.formatMessage({ id: 'common.cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) onDeleteDocument(deleteId)
                setDeleteId(null)
              }}
            >
              {intl.formatMessage({ id: 'documents.delete' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
