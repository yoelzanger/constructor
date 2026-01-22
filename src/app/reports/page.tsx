'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Eye,
  Download,
} from 'lucide-react';

interface ReportData {
  id: string;
  fileName: string;
  reportDate: string;
  inspector: string | null;
  total: number;
  completed: number;
  defects: number;
  inProgress: number;
  progress: number;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportData | null>(null);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch('/api/reports');
        if (!res.ok) throw new Error('Failed to fetch reports');
        const data = await res.json();
        setReports(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  const handleViewPdf = (report: ReportData) => {
    setSelectedReport(report);
    setPdfDialogOpen(true);
  };

  const handleDownloadPdf = (report: ReportData) => {
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = `/api/reports/${report.id}/pdf?download=true`;
    link.download = report.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <ReportsSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <p className="text-red-600">שגיאה: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">דוחות</h1>
        <Badge variant="outline" className="text-sm">
          {reports.length} דוחות
        </Badge>
      </div>

      {/* Summary Stats */}
      {reports.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-3xl font-bold">{reports.length}</div>
                  <p className="text-sm text-muted-foreground">סה״כ דוחות</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="text-lg font-bold">
                    {new Date(reports[0].reportDate).toLocaleDateString('he-IL')}
                  </div>
                  <p className="text-sm text-muted-foreground">דוח אחרון</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <div className="text-3xl font-bold text-green-600">
                    {reports[0].progress}%
                  </div>
                  <p className="text-sm text-muted-foreground">התקדמות נוכחית</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-orange-500" />
                <div>
                  <div className="text-3xl font-bold text-orange-600">
                    {reports[0].defects}
                  </div>
                  <p className="text-sm text-muted-foreground">ליקויים פתוחים</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            רשימת דוחות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תאריך</TableHead>
                <TableHead>שם קובץ</TableHead>
                <TableHead>התקדמות</TableHead>
                <TableHead className="text-center">
                  <CheckCircle2 className="h-4 w-4 inline ml-1" />
                  הושלמו
                </TableHead>
                <TableHead className="text-center">
                  <Clock className="h-4 w-4 inline ml-1" />
                  בטיפול
                </TableHead>
                <TableHead className="text-center">
                  <AlertTriangle className="h-4 w-4 inline ml-1" />
                  ליקויים
                </TableHead>
                <TableHead className="text-center">סה״כ</TableHead>
                <TableHead className="text-center">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report, index) => (
                <TableRow
                  key={report.id}
                  className={index === 0 ? 'bg-blue-50' : ''}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {index === 0 && (
                        <Badge variant="default" className="text-xs">
                          אחרון
                        </Badge>
                      )}
                      {new Date(report.reportDate).toLocaleDateString('he-IL', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {report.fileName}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-32">
                      <Progress value={report.progress} className="h-2 flex-1" />
                      <span className="text-sm font-medium w-12">
                        {report.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      {report.completed}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {report.inProgress}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={report.defects > 0 ? 'destructive' : 'outline'}
                    >
                      {report.defects}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {report.total}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewPdf(report)}
                        title="צפייה בדוח"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadPdf(report)}
                        title="הורדה"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* PDF Viewer Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedReport && (
                <span>
                  {new Date(selectedReport.reportDate).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {selectedReport && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPdf(selectedReport)}
                >
                  <Download className="h-4 w-4 ml-2" />
                  הורדה
                </Button>
              )}
              <DialogClose onClick={() => setPdfDialogOpen(false)} />
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden rounded-b-lg">
            {selectedReport && (
              <iframe
                src={`/api/reports/${selectedReport.id}/pdf`}
                className="w-full h-full border-0"
                title={`PDF Viewer - ${selectedReport.fileName}`}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {reports.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              אין דוחות זמינים. יש לעבד את קבצי ה-PDF תחילה.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
