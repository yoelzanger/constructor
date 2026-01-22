'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CalendarClock,
  Building2,
  Layers,
  TrendingUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  categoryHebrewNames,
  categoryColors,
  WorkCategory,
} from '@/lib/status-mapper';

interface TimelineData {
  date: string;
  reportId: string;
  overallProgress: number;
  totalItems: number;
  completedItems: number;
  apartmentProgress: Record<string, { total: number; completed: number; progress: number }>;
}

interface CategoryProgress {
  date: string;
  categories: Record<string, { total: number; completed: number; progress: number }>;
}

interface TimelineResponse {
  timelineData: TimelineData[];
  categoryProgress: CategoryProgress[];
  apartments: string[];
  categories: string[];
  dateRange: { start: string | null; end: string | null };
}

// Colors for apartments
const apartmentColors: Record<string, string> = {
  '1': '#3b82f6',
  '3': '#22c55e',
  '5': '#f59e0b',
  '6': '#ef4444',
  '7': '#8b5cf6',
  '10': '#06b6d4',
  '11': '#ec4899',
  '14': '#84cc16',
};

export default function TimelinePage() {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTimeline() {
      try {
        const res = await fetch('/api/timeline');
        if (!res.ok) throw new Error('Failed to fetch timeline');
        const result = await res.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchTimeline();
  }, []);

  if (loading) {
    return <TimelineSkeleton />;
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

  if (!data || data.timelineData.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">ציר זמן</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              אין נתונים זמינים. יש לעבד את קבצי ה-PDF תחילה.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare data for charts
  const overallProgressData = data.timelineData.map((d) => ({
    date: d.date,
    progress: d.overallProgress,
    completed: d.completedItems,
    total: d.totalItems,
  }));

  // Prepare apartment progress data
  const apartmentProgressData = data.timelineData.map((d) => {
    const result: Record<string, number | string> = { date: d.date };
    data.apartments.forEach((apt) => {
      result[`apt_${apt}`] = d.apartmentProgress[apt]?.progress || 0;
    });
    return result;
  });

  // Prepare category progress data
  const topCategories = [
    WorkCategory.ELECTRICAL,
    WorkCategory.PLUMBING,
    WorkCategory.AC,
    WorkCategory.TILING,
    WorkCategory.FLOORING,
    WorkCategory.PAINTING,
  ];

  const categoryProgressData = data.categoryProgress.map((d) => {
    const result: Record<string, number | string> = { date: d.date };
    topCategories.forEach((cat) => {
      result[cat] = d.categories[cat]?.progress || 0;
    });
    return result;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CalendarClock className="h-8 w-8" />
          ציר זמן
        </h1>
        {data.dateRange.start && data.dateRange.end && (
          <Badge variant="outline" className="text-sm">
            {new Date(data.dateRange.start).toLocaleDateString('he-IL')} -{' '}
            {new Date(data.dateRange.end).toLocaleDateString('he-IL')}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="overall" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overall" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            התקדמות כללית
          </TabsTrigger>
          <TabsTrigger value="apartments" className="gap-2">
            <Building2 className="h-4 w-4" />
            לפי דירה
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2">
            <Layers className="h-4 w-4" />
            לפי קטגוריה
          </TabsTrigger>
        </TabsList>

        {/* Overall Progress */}
        <TabsContent value="overall">
          <Card>
            <CardHeader>
              <CardTitle>התקדמות כללית לאורך זמן</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={overallProgressData}>
                    <defs>
                      <linearGradient id="progressGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const d = new Date(value);
                        const day = d.getDate().toString().padStart(2, '0');
                        const month = (d.getMonth() + 1).toString().padStart(2, '0');
                        const year = d.getFullYear().toString().slice(-2);
                        return `${day}/${month}/${year}`;
                      }}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(value) =>
                        new Date(value as string).toLocaleDateString('he-IL')
                      }
                      formatter={(value, name) => {
                        if (name === 'progress') return [`${value}%`, 'התקדמות'];
                        if (name === 'completed') return [value, 'הושלמו'];
                        if (name === 'total') return [value, 'סה״כ'];
                        return [value, name];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="progress"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#progressGradient)"
                      name="progress"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Progress Summary */}
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {overallProgressData[0]?.progress || 0}%
                  </div>
                  <p className="text-sm text-muted-foreground">התקדמות ראשונית</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {overallProgressData[overallProgressData.length - 1]?.progress || 0}%
                  </div>
                  <p className="text-sm text-muted-foreground">התקדמות נוכחית</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">
                    +
                    {(overallProgressData[overallProgressData.length - 1]?.progress || 0) -
                      (overallProgressData[0]?.progress || 0)}
                    %
                  </div>
                  <p className="text-sm text-muted-foreground">שיפור כולל</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Apartment */}
        <TabsContent value="apartments">
          <Card>
            <CardHeader>
              <CardTitle>התקדמות לפי דירה לאורך זמן</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={apartmentProgressData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const d = new Date(value);
                        const day = d.getDate().toString().padStart(2, '0');
                        const month = (d.getMonth() + 1).toString().padStart(2, '0');
                        const year = d.getFullYear().toString().slice(-2);
                        return `${day}/${month}/${year}`;
                      }}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(value) =>
                        new Date(value as string).toLocaleDateString('he-IL')
                      }
                      formatter={(value, name) => [
                        `${value}%`,
                        `דירה ${String(name).replace('apt_', '')}`,
                      ]}
                    />
                    <Legend
                      formatter={(value) => `דירה ${value.replace('apt_', '')}`}
                    />
                    {data.apartments.map((apt) => (
                      <Line
                        key={apt}
                        type="monotone"
                        dataKey={`apt_${apt}`}
                        stroke={apartmentColors[apt] || '#6b7280'}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Apartment Legend */}
              <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t justify-center">
                {data.apartments.map((apt) => {
                  const latestProgress =
                    data.timelineData[data.timelineData.length - 1]?.apartmentProgress[
                      apt
                    ]?.progress || 0;
                  return (
                    <div key={apt} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: apartmentColors[apt] || '#6b7280' }}
                      />
                      <span className="text-sm">דירה {apt}</span>
                      <Badge variant="outline">{latestProgress}%</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Category */}
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>התקדמות לפי קטגוריה לאורך זמן</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={categoryProgressData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const d = new Date(value);
                        const day = d.getDate().toString().padStart(2, '0');
                        const month = (d.getMonth() + 1).toString().padStart(2, '0');
                        const year = d.getFullYear().toString().slice(-2);
                        return `${day}/${month}/${year}`;
                      }}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(value) =>
                        new Date(value as string).toLocaleDateString('he-IL')
                      }
                      formatter={(value, name) => [
                        `${value}%`,
                        categoryHebrewNames[String(name) as WorkCategory] || name,
                      ]}
                    />
                    <Legend
                      formatter={(value) =>
                        categoryHebrewNames[value as WorkCategory] || value
                      }
                    />
                    {topCategories.map((cat) => (
                      <Line
                        key={cat}
                        type="monotone"
                        dataKey={cat}
                        stroke={categoryColors[cat]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Category Legend */}
              <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t justify-center">
                {topCategories.map((cat) => {
                  const latestProgress =
                    data.categoryProgress[data.categoryProgress.length - 1]?.categories[
                      cat
                    ]?.progress || 0;
                  return (
                    <div key={cat} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: categoryColors[cat] }}
                      />
                      <span className="text-sm">
                        {categoryHebrewNames[cat] || cat}
                      </span>
                      <Badge variant="outline">{latestProgress}%</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-12 w-full" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
