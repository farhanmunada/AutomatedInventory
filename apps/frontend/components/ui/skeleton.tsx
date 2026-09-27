'use client';

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="td">
              <div className="skeleton h-4" style={{ width: `${40 + ((r * 7 + c * 13) % 50)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function CardSkeleton({ height = 96 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} />;
}
