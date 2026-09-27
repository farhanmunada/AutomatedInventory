'use client';

/**
 * Rendered inside Card content (a plain div), so it must own its <table>
 * wrapper — a bare <tbody> there is invalid HTML and breaks hydration.
 */
export function TableSkeleton({
  rows = 6,
  cols = 5,
  className = 'w-full',
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <table className={className}>
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }, (_, c) => (
              <td key={c} className="td">
                <div
                  className="skeleton h-4"
                  style={{ width: `${40 + ((r * 7 + c * 13) % 50)}%` }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CardSkeleton({ height = 96 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} />;
}
