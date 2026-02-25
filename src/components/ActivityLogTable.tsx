'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, MapPin, Globe, Info, RefreshCw, FileText, Trash2, RotateCcw, Settings, Eye } from 'lucide-react';

interface ActivityEntry {
    id: string;
    timestamp: string;
    activityType: string;
    description: string;
    ipAddress: string | null;
    city: string | null;
    details: string | null;
}

const activityTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
    site_visit: { label: 'ביקור באתר', icon: Eye, color: 'bg-blue-100 text-blue-800' },
    upload: { label: 'העלאת דוח', icon: FileText, color: 'bg-green-100 text-green-800' },
    delete: { label: 'מחיקת דוח', icon: Trash2, color: 'bg-red-100 text-red-800' },
    rollback: { label: 'שחזור', icon: RotateCcw, color: 'bg-orange-100 text-orange-800' },
    config_change: { label: 'שינוי הגדרות', icon: Settings, color: 'bg-purple-100 text-purple-800' },
    snapshot: { label: 'גיבוי', icon: Info, color: 'bg-gray-100 text-gray-800' },
};

export function ActivityLogTable() {
    const [entries, setEntries] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 50;

    const fetchLogs = async (isNew = false) => {
        try {
            setLoading(true);
            const offset = isNew ? 0 : page * LIMIT;
            const res = await fetch(`/api/activity-log?limit=${LIMIT}&offset=${offset}`);
            if (!res.ok) throw new Error('Failed to fetch logs');
            const data = await res.json();

            if (isNew) {
                setEntries(data.entries);
                setPage(1);
            } else {
                setEntries(prev => [...prev, ...data.entries]);
                setPage(prev => prev + 1);
            }

            setHasMore(data.entries.length === LIMIT);
        } catch (error) {
            console.error('Error loading activity log:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs(true);
    }, []);

    const formatDateTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleString('he-IL', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    return (
        <Card className="mt-8">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        יומן פעילות
                    </CardTitle>
                    <CardDescription>מעקב אחר פעולות ושינויים במערכת</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => fetchLogs(true)} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
                    רענן
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border overflow-hidden">
                    <div className="max-h-[400px] overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead className="w-[180px]">תאריך ושעה</TableHead>
                                    <TableHead className="w-[150px]">סוג פעילות</TableHead>
                                    <TableHead>תיאור</TableHead>
                                    <TableHead className="w-[150px]">IP</TableHead>
                                    <TableHead className="w-[120px]">עיר</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {entries.length === 0 && !loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            אין פעילות מוקלטת
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    entries.map((entry) => {
                                        const config = activityTypeConfig[entry.activityType] || activityTypeConfig.snapshot;
                                        const Icon = config.icon;
                                        return (
                                            <TableRow key={entry.id}>
                                                <TableCell className="text-xs font-mono">
                                                    {formatDateTime(entry.timestamp)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={`${config.color} border-none flex items-center gap-1 w-fit`}>
                                                        <Icon className="h-3 w-3" />
                                                        {config.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {entry.description}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Globe className="h-3 w-3" />
                                                    {entry.ipAddress || '---'}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {entry.city ? (
                                                        <span className="flex items-center gap-1">
                                                            <MapPin className="h-3 w-3 text-red-500" />
                                                            {entry.city}
                                                        </span>
                                                    ) : '---'}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                {hasMore && (
                    <div className="mt-4 flex justify-center">
                        <Button variant="ghost" size="sm" onClick={() => fetchLogs()} disabled={loading}>
                            {loading ? 'טוען...' : 'הצג עוד'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
