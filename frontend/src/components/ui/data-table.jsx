import React, { useMemo } from 'react';
import { FixedSizeList as ReactWindowList } from 'react-window/dist/react-window';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Checkbox } from './checkbox';
import { Skeleton } from './skeleton';
import { cn } from '@/lib/utils';

/**
 * DataTable - Reusable virtualized table component for large datasets
 * Features:
 * - Fixed table layout with defined column widths
 * - Sticky header support
 * - Virtualization with react-window for smooth scrolling
 * - Row selection with checkboxes
 * - Click handlers for rows
 * - Loading states
 * - Responsive design support
 */

export function DataTable({
  columns = [],
  data = [],
  loading = false,
  onRowClick,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  virtualized = false,
  rowHeight = 44,
  containerHeight = 600,
  className,
  emptyMessage = 'No data available',
}) {
  // Check if all rows are selected
  const allSelected = useMemo(() => {
    if (!data.length) return false;
    return data.every(row => selectedIds.includes(row.id));
  }, [data, selectedIds]);

  // Toggle all rows selection
  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(data.map(row => row.id));
    }
  };

  // Toggle single row selection
  const handleSelectRow = (rowId, event) => {
    event.stopPropagation();
    if (selectedIds.includes(rowId)) {
      onSelectionChange(selectedIds.filter(id => id !== rowId));
    } else {
      onSelectionChange([...selectedIds, rowId]);
    }
  };

  // Render loading skeleton
  if (loading) {
    return (
      <div className="w-full">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && (
                  <TableHead className="w-12">
                    <Skeleton className="h-4 w-4" />
                  </TableHead>
                )}
                {columns.map((col, idx) => (
                  <TableHead key={idx} style={{ width: col.width }}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={idx}>
                  {selectable && (
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  )}
                  {columns.map((_, colIdx) => (
                    <TableCell key={colIdx}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data.length) {
    return (
      <div className="w-full">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && <TableHead className="w-12"></TableHead>}
                {columns.map((col, idx) => (
                  <TableHead key={idx} style={{ width: col.width }}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-32 text-center">
                  <div className="text-muted-foreground">{emptyMessage}</div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Render row component for virtualization
  const VirtualRow = ({ index, style }) => {
    const row = data[index];
    const isSelected = selectedIds.includes(row.id);

    return (
      <div style={style}>
        <TableRow
          className={cn(
            'cursor-pointer border-b transition-colors hover:bg-muted/50',
            isSelected && 'bg-muted'
          )}
          onClick={() => onRowClick?.(row)}
        >
          {selectable && (
            <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={(e) => handleSelectRow(row.id, e)}
              />
            </TableCell>
          )}
          {columns.map((col, colIdx) => (
            <TableCell
              key={colIdx}
              style={{ width: col.width }}
              className={cn(
                'overflow-hidden text-ellipsis whitespace-nowrap',
                col.cellClassName
              )}
            >
              {col.cell ? col.cell(row) : row[col.accessorKey]}
            </TableCell>
          ))}
        </TableRow>
      </div>
    );
  };

  // Non-virtualized rendering
  if (!virtualized) {
    return (
      <div className={cn('w-full', className)}>
        <div className="rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {selectable && (
                  <TableHead className="w-12">
                    <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                  </TableHead>
                )}
                {columns.map((col, idx) => (
                  <TableHead key={idx} style={{ width: col.width }} className={col.headerClassName}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const isSelected = selectedIds.includes(row.id);
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-muted/50',
                      isSelected && 'bg-muted'
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(e) => handleSelectRow(row.id, e)}
                        />
                      </TableCell>
                    )}
                    {columns.map((col, colIdx) => (
                      <TableCell
                        key={colIdx}
                        style={{ width: col.width }}
                        className={cn(
                          'overflow-hidden text-ellipsis whitespace-nowrap',
                          col.cellClassName
                        )}
                      >
                        {col.cell ? col.cell(row) : row[col.accessorKey]}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Virtualized rendering with react-window
  return (
    <div className={cn('w-full', className)}>
      <div className="rounded-md border">
        {/* Sticky Header */}
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                </TableHead>
              )}
              {columns.map((col, idx) => (
                <TableHead key={idx} style={{ width: col.width }} className={col.headerClassName}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        </Table>

        {/* Virtualized Body */}
        <ReactWindowList
          height={containerHeight}
          itemCount={data.length}
          itemSize={rowHeight}
          width="100%"
          className="scrollbar-thin"
        >
          {VirtualRow}
        </ReactWindowList>
      </div>
    </div>
  );
}
