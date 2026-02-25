'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  CheckCircle2,
  Settings,
  RotateCcw,
  Save,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ActivityLogTable } from '@/components/ActivityLogTable';

interface ProgressConfig {
  categoryWeights: Record<string, number>;
  progressThresholds: Record<string, number>;
  baselineProgress: number;
  maxProgress: number;
  defectPenalty: number;
  defaultCategoryWeight: number;
  lastUpdated: string | null;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface Labels {
  categories: Record<string, string>;
  thresholds: Record<string, string>;
  descriptions: Record<string, string>;
}

interface ConfigData {
  config: ProgressConfig;
  validation: ValidationResult;
  defaults: ProgressConfig;
  labels: Labels;
}

export default function AdminPage() {
  const [data, setData] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Local state for editing
  const [editConfig, setEditConfig] = useState<ProgressConfig | null>(null);
  const [liveValidation, setLiveValidation] = useState<ValidationResult | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (editConfig && data) {
      // Check if there are changes
      const changed = JSON.stringify(editConfig) !== JSON.stringify(data.config);
      setHasChanges(changed);

      // Validate on every change
      if (editConfig) {
        validateLocally(editConfig);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editConfig, data]);

  async function fetchConfig() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/config');
      if (!res.ok) throw new Error('Failed to fetch configuration');
      const result = await res.json();
      setData(result);
      setEditConfig(result.config);
      setLiveValidation(result.validation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // Wrap validateLocally in useCallback to suppress lint warning
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function validateLocally(config: ProgressConfig) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check category weights sum to 100
    const weightSum = Object.values(config.categoryWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 100) > 0.01) {
      errors.push(`משקלי הקטגוריות חייבים להסתכם ל-100% (סה"כ נוכחי: ${weightSum.toFixed(1)}%)`);
    }

    // Check all weights are non-negative
    for (const [cat, weight] of Object.entries(config.categoryWeights)) {
      if (weight < 0) {
        errors.push(`משקל קטגוריה "${data?.labels.categories[cat] || cat}" לא יכול להיות שלילי`);
      }
    }

    // Check thresholds are between 0 and 100
    for (const [key, value] of Object.entries(config.progressThresholds)) {
      if (value < 0 || value > 100) {
        errors.push(`ערך סף "${data?.labels.thresholds[key] || key}" חייב להיות בין 0 ל-100`);
      }
    }

    // Check baseline and max progress
    if (config.baselineProgress >= config.maxProgress) {
      errors.push('התקדמות בסיס חייבת להיות נמוכה מהתקדמות מקסימלית');
    }

    setLiveValidation({ valid: errors.length === 0, errors, warnings });
  }

  async function handleSave() {
    if (!editConfig || !liveValidation?.valid) return;

    try {
      setSaving(true);
      setSaveMessage(null);

      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: editConfig }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to save');
      }

      setData(prev => prev ? { ...prev, config: result.config, validation: result.validation } : prev);
      setHasChanges(false);
      setSaveMessage({ type: 'success', text: 'ההגדרות נשמרו בהצלחה' });

      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'שגיאה בשמירה' });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      setSaving(true);
      const res = await fetch('/api/admin/config', { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to reset');

      const result = await res.json();
      setData(prev => prev ? { ...prev, config: result.config } : prev);
      setEditConfig(result.config);
      setHasChanges(false);
      setShowResetDialog(false);
      setSaveMessage({ type: 'success', text: 'ההגדרות אופסו לברירת המחדל' });

      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({ type: 'error', text: 'שגיאה באיפוס' });
    } finally {
      setSaving(false);
    }
  }

  function updateWeight(category: string, value: number) {
    if (!editConfig) return;
    setEditConfig({
      ...editConfig,
      categoryWeights: {
        ...editConfig.categoryWeights,
        [category]: value,
      },
    });
  }

  function updateThreshold(key: string, value: number) {
    if (!editConfig) return;
    setEditConfig({
      ...editConfig,
      progressThresholds: {
        ...editConfig.progressThresholds,
        [key]: value,
      },
    });
  }

  function updateGeneralParam(key: keyof ProgressConfig, value: number) {
    if (!editConfig) return;
    setEditConfig({
      ...editConfig,
      [key]: value,
    });
  }

  // Auto-balance weights to sum to 100
  function autoBalanceWeights() {
    if (!editConfig) return;

    const weights = { ...editConfig.categoryWeights };
    const currentSum = Object.values(weights).reduce((a, b) => a + b, 0);

    if (currentSum === 0) return;

    // Scale all weights proportionally to sum to 100
    const factor = 100 / currentSum;
    for (const key of Object.keys(weights)) {
      weights[key] = Math.round(weights[key] * factor * 10) / 10;
    }

    // Fix rounding errors by adjusting the largest weight
    const newSum = Object.values(weights).reduce((a, b) => a + b, 0);
    const diff = 100 - newSum;
    if (diff !== 0) {
      const largestKey = Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0];
      weights[largestKey] = Math.round((weights[largestKey] + diff) * 10) / 10;
    }

    setEditConfig({
      ...editConfig,
      categoryWeights: weights,
    });
  }

  if (loading) {
    return <AdminSkeleton />;
  }

  if (error || !data || !editConfig) {
    return (
      <div className="p-6">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <p className="text-red-600">שגיאה: {error || 'Failed to load configuration'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const weightSum = Object.values(editConfig.categoryWeights).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            הגדרות אדמין
          </h1>
          <p className="text-muted-foreground mt-1">
            הגדרת פרמטרים לחישוב התקדמות הפרויקט
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              יש שינויים שלא נשמרו
            </Badge>
          )}
          {data.config.lastUpdated && (
            <span className="text-sm text-muted-foreground">
              עודכן: {new Date(data.config.lastUpdated).toLocaleDateString('he-IL')}
            </span>
          )}
        </div>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <Card className={saveMessage.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
          <CardContent className="pt-4 pb-4 flex items-center gap-2">
            {saveMessage.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            )}
            <span className={saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}>
              {saveMessage.text}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Validation Errors/Warnings */}
      {liveValidation && (liveValidation.errors.length > 0 || liveValidation.warnings.length > 0) && (
        <Card className={liveValidation.errors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}>
          <CardContent className="pt-4 pb-4">
            {liveValidation.errors.length > 0 && (
              <div className="space-y-1">
                {liveValidation.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">{err}</span>
                  </div>
                ))}
              </div>
            )}
            {liveValidation.warnings.length > 0 && (
              <div className="space-y-1 mt-2">
                {liveValidation.warnings.map((warn, i) => (
                  <div key={i} className="flex items-center gap-2 text-yellow-700">
                    <Info className="h-4 w-4" />
                    <span className="text-sm">{warn}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="weights" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="weights">משקלי קטגוריות</TabsTrigger>
          <TabsTrigger value="thresholds">ערכי סף סטטוס</TabsTrigger>
          <TabsTrigger value="general">פרמטרים כלליים</TabsTrigger>
        </TabsList>

        {/* Category Weights Tab */}
        <TabsContent value="weights">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>משקלי קטגוריות</span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={Math.abs(weightSum - 100) < 0.01 ? 'default' : 'destructive'}
                    className="text-lg px-3 py-1"
                  >
                    סה&quot;כ: {weightSum.toFixed(1)}%
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={autoBalanceWeights}
                    disabled={weightSum === 100}
                  >
                    איזון אוטומטי ל-100%
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                קבע את המשקל היחסי של כל קטגוריה בחישוב ההתקדמות הכללית. הסכום חייב להיות 100%.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(editConfig.categoryWeights).map(([category, weight]) => (
                  <div key={category} className="flex items-center gap-3 p-3 border rounded-lg">
                    <Label className="w-32 text-right font-medium">
                      {data.labels.categories[category] || category}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={weight}
                      onChange={(e) => updateWeight(category, parseFloat(e.target.value) || 0)}
                      className="w-24 text-center"
                    />
                    <span className="text-muted-foreground">%</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(weight, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Progress Thresholds Tab */}
        <TabsContent value="thresholds">
          <Card>
            <CardHeader>
              <CardTitle>ערכי סף התקדמות</CardTitle>
              <CardDescription>
                קבע את אחוז ההתקדמות עבור כל סטטוס. ערכים גבוהים יותר מייצגים התקדמות רבה יותר.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(editConfig.progressThresholds)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="w-48 text-right">
                        <Label className="font-medium">
                          {data.labels.thresholds[key] || key}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {data.labels.descriptions[key]}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={value}
                        onChange={(e) => updateThreshold(key, parseInt(e.target.value) || 0)}
                        className="w-20 text-center"
                      />
                      <span className="text-muted-foreground">%</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${value >= 80 ? 'bg-green-500' :
                            value >= 60 ? 'bg-blue-500' :
                              value >= 40 ? 'bg-yellow-500' :
                                value >= 20 ? 'bg-orange-500' :
                                  'bg-red-500'
                            }`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <span className="w-12 text-sm text-muted-foreground">{value}%</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* General Parameters Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>פרמטרים כלליים</CardTitle>
              <CardDescription>
                הגדרות כלליות המשפיעות על חישוב ההתקדמות
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 p-4 border rounded-lg">
                  <Label htmlFor="baseline">התקדמות בסיס (%)</Label>
                  <p className="text-xs text-muted-foreground">
                    אחוז ההתקדמות ההתחלתי לפני תחילת הפיקוח (עבודות שלד)
                  </p>
                  <Input
                    id="baseline"
                    type="number"
                    min="0"
                    max="100"
                    value={editConfig.baselineProgress}
                    onChange={(e) => updateGeneralParam('baselineProgress', parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                </div>

                <div className="space-y-2 p-4 border rounded-lg">
                  <Label htmlFor="max">התקדמות מקסימלית (%)</Label>
                  <p className="text-xs text-muted-foreground">
                    אחוז ההתקדמות המקסימלי שניתן להשיג
                  </p>
                  <Input
                    id="max"
                    type="number"
                    min="0"
                    max="100"
                    value={editConfig.maxProgress}
                    onChange={(e) => updateGeneralParam('maxProgress', parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                </div>

                <div className="space-y-2 p-4 border rounded-lg">
                  <Label htmlFor="penalty">קנס ליקוי (%)</Label>
                  <p className="text-xs text-muted-foreground">
                    אחוז הקנס שמופחת עבור כל ליקוי
                  </p>
                  <Input
                    id="penalty"
                    type="number"
                    min="0"
                    max="50"
                    value={editConfig.defectPenalty}
                    onChange={(e) => updateGeneralParam('defectPenalty', parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                </div>

                <div className="space-y-2 p-4 border rounded-lg">
                  <Label htmlFor="defaultWeight">משקל ברירת מחדל לקטגוריה</Label>
                  <p className="text-xs text-muted-foreground">
                    משקל עבור קטגוריות שאינן ברשימה
                  </p>
                  <Input
                    id="defaultWeight"
                    type="number"
                    min="0"
                    max="50"
                    value={editConfig.defaultCategoryWeight}
                    onChange={(e) => updateGeneralParam('defaultCategoryWeight', parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(true)}
              disabled={saving}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <RotateCcw className="h-4 w-4 ml-2" />
              איפוס לברירת מחדל
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditConfig(data.config);
                  setHasChanges(false);
                }}
                disabled={!hasChanges || saving}
              >
                ביטול שינויים
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || !liveValidation?.valid || saving}
              >
                <Save className="h-4 w-4 ml-2" />
                {saving ? 'שומר...' : 'שמור הגדרות'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>איפוס לברירת מחדל</DialogTitle>
            <DialogDescription>
              האם אתה בטוח שברצונך לאפס את כל ההגדרות לברירת המחדל?
              פעולה זו לא ניתנת לביטול.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={saving}>
              {saving ? 'מאפס...' : 'אפס הגדרות'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Log Section */}
      <ActivityLogTable />
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-10 w-48" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
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
