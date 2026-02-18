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
  Upload,
  Loader2,
  Trash2,
  History,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useUpload } from '@/context/UploadContext';

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
  progressDelta?: number;
  hasErrors?: boolean;
  errorDetails?: string;
  hasWarnings?: boolean;
  warningDetails?: string;
}

interface SnapshotData {
  id: string;
  reason: string;
  reportCount: number;
  createdAt: string;
  restoredAt: string | null;
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportData | null>(null);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);

  // Local state for the "Select Files" dialog only
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<ReportData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Error/Retry State
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [selectedError, setSelectedError] = useState<ReportData | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Rollback/Snapshot state
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotData | null>(null);

  // Use global upload context
  const { uploadFiles, uploading: isGlobalUploading } = useUpload();

  const fetchReports = async () => {
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
  };

  useEffect(() => {
    fetchReports();
  }, []);

  // Poll for report updates when global upload finishes
  useEffect(() => {
    if (!isGlobalUploading) {
      fetchReports();
    }
  }, [isGlobalUploading]);

  const handleViewPdf = (report: ReportData) => {
    setSelectedReport(report);
    setPdfDialogOpen(true);
  };

  const handleDownloadPdf = (report: ReportData) => {
    const link = document.createElement('a');
    link.href = `/api/reports/${report.id}/pdf?download=true`;
    link.download = report.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleErrorView = (report: ReportData) => {
    setSelectedError(report);
    setErrorDialogOpen(true);
  };

  const handleRetry = async (report: ReportData) => {
    setRetrying(report.id);
    try {
      const res = await fetch(`/api/reports/${report.id}/retry`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        await fetchReports();
        if (errorDialogOpen) setErrorDialogOpen(false);
      } else {
        // If failed again, maybe show toast or update internal error state?
        // Ideally we'd show a toast here. For now alert or console.
        console.error("Retry failed:", data.error);
        alert(`Retry failed: ${data.message || data.error}`);
      }
    } catch (e) {
      console.error("Retry error:", e);
      alert("Retry failed due to network error");
    } finally {
      setRetrying(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setUploadDialogOpen(false); // Close local dialog
      await uploadFiles(files);   // Trigger global upload
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setUploadDialogOpen(false); // Close local dialog
      await uploadFiles(files);   // Trigger global upload
    }
  };

  // Fetch available snapshots
  const fetchSnapshots = async () => {
    setLoadingSnapshots(true);
    try {
      const res = await fetch('/api/snapshots?limit=15');
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data);
      }
    } catch (err) {
      console.error('Error fetching snapshots:', err);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  // Open rollback dialog
  const handleOpenRollback = () => {
    setRollbackDialogOpen(true);
    fetchSnapshots();
  };

  // Perform rollback
  const handleRollback = async () => {
    if (!selectedSnapshot) return;

    setRollingBack(true);
    try {
      const res = await fetch('/api/snapshots/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: selectedSnapshot.id }),
      });

      if (res.ok) {
        await fetchReports();
        setRollbackDialogOpen(false);
        setSelectedSnapshot(null);
      } else {
        const data = await res.json();
        console.error('Rollback failed:', data.error);
      }
    } catch (err) {
      console.error('Error during rollback:', err);
    } finally {
      setRollingBack(false);
    }
  };

  const handleDeleteClick = (report: ReportData) => {
    setReportToDelete(report);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!reportToDelete) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/reports/${reportToDelete.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchReports();
        setDeleteDialogOpen(false);
        setReportToDelete(null);
      } else {
        const data = await res.json();
        console.error('Error deleting report:', data.error);
      }
    } catch (err) {
      console.error('Error deleting report:', err);
    } finally {
      setDeleting(false);
    }
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
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">
            {reports.length} דוחות
          </Badge>
          <Button
            variant="outline"
            onClick={handleOpenRollback}
            title="שחזור מגיבוי"
          >
            <History className="h-4 w-4 ml-2" />
            שחזור
          </Button>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 ml-2" />
            העלאת דוח
          </Button>
        </div>
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
                    {reports[0]?.reportDate ? new Date(reports[0].reportDate).toLocaleDateString('he-IL') : '-'}
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
                    {reports[0]?.progress ?? 0}%
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
                    {reports[0]?.defects ?? 0}
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
                <TableHead>שם קובץ</TableHead>
                <TableHead>תאריך</TableHead>
                <TableHead>התקדמות</TableHead>
                <TableHead className="text-center">התקדמות לדוח</TableHead>
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
                  className={`${index === 0 ? 'bg-blue-50/50' : ''} ${report.hasErrors ? 'bg-red-50/50' : ''}`}
                >
                  <TableCell className="font-medium max-w-xs">
                    <div className="flex items-center gap-2">
                      {report.hasErrors ? (
                        <div className="flex items-center gap-2 text-red-600" title="שגיאה בעיבוד הקובץ">
                          <AlertCircle className="h-4 w-4" />
                          <span className="truncate">{report.fileName}</span>
                        </div>
                      ) : report.hasWarnings ? (
                        <div className="flex items-center gap-2 text-yellow-600" title="נמצאו אזהרות בעיבוד הקובץ">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="truncate">{report.fileName}</span>
                        </div>
                      ) : (
                        <>
                          {index === 0 && (
                            <Badge variant="default" className="text-xs">
                              אחרון
                            </Badge>
                          )}
                          <span className="truncate">{report.fileName}</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(report.reportDate).toLocaleDateString('he-IL', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </TableCell>

                  {report.hasErrors ? (
                    <TableCell colSpan={6} className="text-center text-red-500 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <XCircle className="h-4 w-4" />
                        עיבוד הקובץ נכשל
                      </div>
                    </TableCell>
                  ) : (
                    <>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-32">
                          <Progress value={report.progress} className="h-2 flex-1" />
                          <span className="text-sm font-medium w-12">
                            {report.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={
                            (report.progressDelta ?? 0) > 0
                              ? "bg-green-50 text-green-700"
                              : (report.progressDelta ?? 0) < 0
                                ? "bg-red-50 text-red-700"
                                : "bg-orange-50 text-orange-600"
                          }
                        >
                          {(report.progressDelta ?? 0) > 0
                            ? `+${report.progressDelta}%`
                            : (report.progressDelta ?? 0) < 0
                              ? `${report.progressDelta}%`
                              : "Zero"}
                        </Badge>
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
                    </>
                  )}

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {(report.hasErrors || report.hasWarnings) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleErrorView(report)}
                            title={report.hasErrors ? "פרטי שגיאה" : "פרטי אזהרות"}
                            className={report.hasErrors ? "text-red-500 hover:text-red-700 hover:bg-red-100" : "text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100"}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetry(report)}
                            disabled={retrying === report.id}
                            title="נסה שנית"
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                          >
                            {retrying === report.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}

                      {!report.hasErrors && (
                        <>
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
                        </>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(report)}
                        title="מחיקה"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
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

      {/* Error/Warning Details Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${selectedError?.hasErrors ? 'text-red-600' : 'text-yellow-600'}`}>
              {selectedError?.hasErrors ? <AlertCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              {selectedError?.hasErrors ? 'שגיאה בעיבוד הקובץ' : 'אזהרות בעיבוד הקובץ'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg text-sm font-mono overflow-auto max-h-60 whitespace-pre-wrap dir-ltr">
              {selectedError?.hasErrors ? (
                selectedError.errorDetails ? (
                  (() => {
                    try {
                      const parsed = JSON.parse(selectedError.errorDetails);
                      return JSON.stringify(parsed, null, 2);
                    } catch {
                      return selectedError.errorDetails;
                    }
                  })()
                ) : 'אין פרטים נוספים'
              ) : selectedError?.hasWarnings ? (
                selectedError.warningDetails ? (
                  (() => {
                    try {
                      const parsed = JSON.parse(selectedError.warningDetails);
                      return JSON.stringify(parsed, null, 2);
                    } catch {
                      return selectedError.warningDetails;
                    }
                  })()
                ) : 'אין פירוט אזהרות'
              ) : 'אין פרטים'}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setErrorDialogOpen(false)}>
                סגור
              </Button>
              {selectedError && (
                <Button
                  onClick={() => handleRetry(selectedError)}
                  disabled={retrying === selectedError.id}
                >
                  {retrying === selectedError.id ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      מעבד מחדש...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 ml-2" />
                      נסה שנית
                    </>
                  )}
                </Button>
              )}
            </div>
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

      {/* Upload Dialog - Selection Only */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              העלאת דוחות
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors
                ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
                cursor-pointer hover:border-primary/50
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input
                id="file-upload"
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              <div className="flex flex-col items-center gap-3">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">גרור קבצי PDF לכאן</p>
                  <p className="text-sm text-muted-foreground">או לחץ לבחירת קבצים</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              ההעלאה תתבצע ברקע ותוכל להמשיך להשתמש במערכת כרגיל.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              מחיקת דוח
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>האם אתה בטוח שברצונך למחוק דוח זה?</p>
            {reportToDelete && (
              <div className="p-3 rounded-lg bg-muted">
                <p className="font-medium">
                  {new Date(reportToDelete.reportDate).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {reportToDelete.fileName}
                </p>
              </div>
            )}
            <p className="text-sm text-red-500 font-medium">
              פעולה זו תמחק את כל הנתונים, הפריטים והבדיקות הקשורים לדוח זה.
              לא ניתן לבטל פעולה זו.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleting}
              >
                ביטול
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    מוחק...
                  </>
                ) : (
                  'מחיקה'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rollback Dialog */}
      <Dialog open={rollbackDialogOpen} onOpenChange={setRollbackDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              שחזור מגיבוי
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              בחר נקודת זמן לשחזור. פעולה זו תחזיר את המערכת למצב שהיה באותו רגע.
            </p>

            {loadingSnapshots ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-4">
                לא נמצאו נקודות שחזור
              </p>
            ) : (
              <div className="space-y-2">
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className={`
                      p-3 rounded-lg border cursor-pointer transition-colors
                      ${selectedSnapshot?.id === snapshot.id
                        ? 'bg-primary/5 border-primary'
                        : 'hover:bg-muted/50'
                      }
                    `}
                    onClick={() => setSelectedSnapshot(snapshot)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm">
                        {new Date(snapshot.createdAt).toLocaleString('he-IL')}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {snapshot.reportCount} דוחות
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {snapshot.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {selectedSnapshot && (
              <div className="p-3 rounded-lg bg-orange-50 text-orange-700 text-sm flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  שחזור יחליף את כל הנתונים הנוכחיים בנתונים מהגיבוי שנבחר. פעולה זו לא ניתנת לביטול.
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setRollbackDialogOpen(false)}
                disabled={rollingBack}
              >
                ביטול
              </Button>
              <Button
                onClick={handleRollback}
                disabled={!selectedSnapshot || rollingBack}
              >
                {rollingBack ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    משחזר...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 ml-2" />
                    שחזור
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
