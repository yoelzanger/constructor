'use client';

import { useUpload } from '@/context/UploadContext';
import {
    Loader2,
    X,
    Minimize2,
    Maximize2,
    CheckCircle2,
    AlertTriangle,
    FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function UploadProgress() {
    const {
        isOpen,
        uploading,
        progress,
        total,
        currentFile,
        results,
        closeUploadWindow,
        cancelUpload,
        confirmUpload
    } = useUpload();

    const [isMinimized, setIsMinimized] = useState(false);

    if (!isOpen) return null;

    return (
        <div className={cn(
            "fixed bottom-4 right-4 z-50 w-96 bg-background border rounded-lg shadow-lg transition-all duration-300",
            isMinimized ? "h-14 overflow-hidden" : "h-auto max-h-[80vh] flex flex-col"
        )}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-muted/50">
                <div className="flex items-center gap-2 font-semibold">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    {uploading ? 'מעלה קבצים...' : 'העלאה הסתיימה'}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setIsMinimized(!isMinimized)}
                    >
                        {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                    </Button>
                    {!uploading && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-red-100 hover:text-red-600"
                            onClick={closeUploadWindow}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 flex-1 overflow-hidden flex flex-col">
                {uploading && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>מעבד קובץ {progress + 1} מתוך {total}</span>
                            <span className="text-muted-foreground truncate max-w-[150px]">{currentFile}</span>
                        </div>
                        <Progress value={(progress / total) * 100} className="h-2" />
                        <Button
                            variant="destructive"
                            size="sm"
                            className="w-full mt-2"
                            onClick={cancelUpload}
                        >
                            בטל העלאה
                        </Button>
                    </div>
                )}

                <ScrollArea className="flex-1 max-h-60 pr-4">
                    <div className="space-y-3">
                        {results.map((result, index) => (
                            <div
                                key={index}
                                className={cn(
                                    "p-3 rounded-md text-sm border",
                                    result.success
                                        ? "bg-green-50 border-green-200 text-green-700"
                                        : result.requiresConfirmation
                                            ? "bg-yellow-50 border-yellow-200 text-yellow-800"
                                            : "bg-red-50 border-red-200 text-red-700"
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    {result.success ? (
                                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                                    ) : result.requiresConfirmation ? (
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{result.fileName}</p>
                                        <p className="text-xs mt-1 break-words whitespace-pre-wrap">
                                            {result.message}
                                        </p>
                                        {result.requiresConfirmation && result.file && !uploading && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="mt-2 text-xs h-7 border-yellow-300 hover:bg-yellow-100 text-yellow-800"
                                                onClick={() => confirmUpload(result.file!, true)}
                                            >
                                                אשר העלאה
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
