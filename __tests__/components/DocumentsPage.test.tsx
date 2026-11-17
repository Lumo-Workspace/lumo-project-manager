/** @jest-environment jsdom */
const messages: Record<string, string> = {
  'documents.untitled': 'Untitled',
  'documents.copyLink': 'Copy link',
  'documents.delete': 'Delete',
  'documents.filterPersonal': 'Personal',
  'documents.filterShared': 'Shared',
  'documents.filterWorkspace': 'Workspace',
  'documents.colName': 'Document',
  'documents.colTags': 'Tags',
  'documents.colCreator': 'Creator',
  'documents.colCollaborators': 'Collaborators',
  'documents.colUpdatedAt': 'Updated',
  'common.moreActions': 'More actions',
}

jest.mock('react-intl', () => ({
  useIntl: () => ({
    locale: 'en',
    formatMessage: ({ id }: { id: string }) => messages[id] ?? id,
  }),
}))

// PageBreadcrumb renders a SidebarTrigger, which needs a SidebarProvider.
jest.mock('@/app/workspace/[workspaceUrl]/components/PageBreadcrumb', () => ({
  PageBreadcrumb: ({ actions }: { actions?: React.ReactNode }) => (
    <div>{actions}</div>
  ),
}))

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentsPage } from '@/app/workspace/[workspaceUrl]/components/pages/DocumentsPage'
import type { ApiDocument } from '@/app/workspace/[workspaceUrl]/types'
import { CACHE_KEY } from '@/app/workspace/[workspaceUrl]/constants'

function makeDoc(over: Partial<ApiDocument>): ApiDocument {
  return {
    id: 'd1',
    number: 1,
    slug: 'spec-1',
    title: 'Spec',
    emoji: null,
    parentId: null,
    projectId: null,
    workspaceId: 'w',
    createdById: 'm1',
    createdBy: { id: 'm1', name: 'Ada', imageUrl: null },
    visibility: 'WORKSPACE',
    sortOrder: 0,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
    ...over,
  }
}

const docs = [
  makeDoc({
    id: 'd1',
    title: 'Spec',
    project: { id: 'p1', name: 'Platform' },
  }),
  makeDoc({ id: 'd2', slug: 'notes-2', title: '', visibility: 'PRIVATE' }),
]

function renderPage(over: Partial<Parameters<typeof DocumentsPage>[0]> = {}) {
  const props = {
    documents: docs,
    loading: false,
    error: null,
    onRetry: jest.fn(),
    onNewDocument: jest.fn(),
    onSelectDocument: jest.fn(),
    onDeleteDocument: jest.fn(),
    onCopyLink: jest.fn(),
    ...over,
  }
  render(<DocumentsPage {...props} />)
  return props
}

describe('DocumentsPage', () => {
  beforeEach(() => localStorage.clear())

  it('list view lays every row out under one set of column headers', () => {
    renderPage()
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual([
      'Document',
      'Tags',
      'Creator',
      'Collaborators',
      'Updated',
      'More actions',
    ])
    // header row + one row per document, all with the same cell count
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(docs.length + 1)
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole('cell')).toHaveLength(headers.length)
    }
  })

  it('shows the project name as the subtitle, with no hard-coded English preposition', () => {
    renderPage()
    const [, projectRow, personalRow] = screen.getAllByRole('row')
    expect(within(projectRow!).getByText('Platform')).toBeTruthy()
    expect(screen.queryByText(/^in /)).toBeNull()
    // no project: the visibility scope stands in
    expect(within(personalRow!).getByText('Personal')).toBeTruthy()
  })

  it('opens a document from its title button, by click and by keyboard', async () => {
    const user = userEvent.setup()
    const props = renderPage()
    await user.click(screen.getByRole('button', { name: 'Spec' }))
    expect(props.onSelectDocument).toHaveBeenLastCalledWith(docs[0])

    screen.getByRole('button', { name: 'Untitled' }).focus()
    await user.keyboard('{Enter}')
    expect(props.onSelectDocument).toHaveBeenLastCalledWith(docs[1])
  })

  it('"Copy link" hands the document to onCopyLink without opening it', async () => {
    const user = userEvent.setup()
    const props = renderPage()
    const menus = screen.getAllByRole('button', { name: 'More actions' })
    await user.click(menus[0]!)
    await user.click(await screen.findByRole('menuitem', { name: 'Copy link' }))
    expect(props.onCopyLink).toHaveBeenCalledWith(docs[0])
    expect(props.onSelectDocument).not.toHaveBeenCalled()
  })

  it('board cards open from the title button and offer the same menu', async () => {
    localStorage.setItem(CACHE_KEY.docViewMode, 'board')
    const user = userEvent.setup()
    const props = renderPage()
    expect(screen.queryByRole('columnheader')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Spec' }))
    expect(props.onSelectDocument).toHaveBeenCalledWith(docs[0])
    expect(
      screen.getAllByRole('button', { name: 'More actions' })
    ).toHaveLength(docs.length)
  })
})
