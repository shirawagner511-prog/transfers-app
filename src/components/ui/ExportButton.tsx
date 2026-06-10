import { Download } from 'lucide-react';
import { Button } from './Button';
import { exportToExcel, type ExportRow } from '@/lib/exportExcel';

interface ExportButtonProps {
  filename: string;
  rows: ExportRow[];
  label?: string;
}

/** Small "export to Excel" button. Disabled when there's nothing to export. */
export function ExportButton({ filename, rows, label = 'ייצוא לאקסל' }: ExportButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      icon={<Download className="w-4 h-4" />}
      onClick={() => exportToExcel(filename, rows)}
      disabled={rows.length === 0}
    >
      {label}
    </Button>
  );
}
