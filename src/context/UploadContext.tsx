'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface UploadResult {
    fileName: string;
    success: boolean;
    message: string;
    requiresConfirmation?: boolean;
    warnings?: string[];
    confidence?: string;
    file?: File; // Keep reference for retry/confirm
}

interface UploadState {
    uploading: boolean;
    progress: number;
    total: number;
    currentFile: string;
    results: UploadResult[];
    queue: File[];
    isOpen: boolean; // Is the upload modal/window open?
}

interface UploadContextType extends UploadState {
    uploadFiles: (files: File[]) => Promise<void>;
    confirmUpload: (file: File, force: boolean) => Promise<void>;
    cancelUpload: () => void;
    closeUploadWindow: () => void;
    openUploadWindow: () => void;
    clearResults: () => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<UploadState>({
        uploading: false,
        progress: 0,
        total: 0,
        currentFile: '',
        results: [],
        queue: [],
        isOpen: false,
    });

    const [abortController, setAbortController] = useState<AbortController | null>(null);

    const uploadSingleFile = async (file: File, force: boolean = false): Promise<UploadResult> => {
        const formData = new FormData();
        formData.append('file', file);
        if (force) {
            formData.append('force', 'true');
        }

        try {
            const controller = new AbortController();
            setAbortController(controller);

            const res = await fetch('/api/reports/upload', {
                method: 'POST',
                body: formData,
                signal: controller.signal,
            });

            const data = await res.json();

            // Handle 202 - requires confirmation
            if (res.status === 202 && data.requiresConfirmation) {
                return {
                    fileName: file.name,
                    success: false,
                    message: data.message,
                    requiresConfirmation: true,
                    warnings: data.validationWarnings,
                    confidence: data.confidence,
                    file: file,
                };
            }

            if (!res.ok) {
                let errorMsg = data.error || 'שגיאה בהעלאת הקובץ';
                if (data.validationErrors && data.validationErrors.length > 0) {
                    errorMsg = Array.isArray(data.validationErrors)
                        ? data.validationErrors.join(', ')
                        : data.validationErrors;
                }
                return { fileName: file.name, success: false, message: errorMsg };
            }

            // Fixed: Handle missing workItemsCreated or 0 cases
            const itemsCount = data.workItemsCreated ?? 0;
            let successMsg = `הדוח עובד בהצלחה (${itemsCount} פריטים)`;

            if (data.validation?.warnings?.length > 0) {
                successMsg = `הועלה עם ${data.validation.warnings.length} אזהרות`;
            }
            return { fileName: file.name, success: true, message: successMsg };
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                return { fileName: file.name, success: false, message: 'העלאה בוטלה' };
            }
            return {
                fileName: file.name,
                success: false,
                message: err instanceof Error ? err.message : 'שגיאה לא ידועה'
            };
        } finally {
            setAbortController(null);
        }
    };

    const processQueue = async (files: File[]) => {
        setState(prev => ({
            ...prev,
            uploading: true,
            queue: files,
            total: files.length,
            progress: 0,
            isOpen: true,
        }));

        const results: UploadResult[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Update state for current file
            setState(prev => ({
                ...prev,
                currentFile: file.name,
                progress: i,
            }));

            const result = await uploadSingleFile(file);
            results.push(result);

            // Add result to state immediately
            setState(prev => ({
                ...prev,
                results: [...prev.results, result],
            }));

            // If cancelled, stop processing
            if (result.message === 'העלאה בוטלה') break;
        }

        setState(prev => ({
            ...prev,
            uploading: false,
            progress: files.length,
            currentFile: 'הושלם',
        }));
    };

    const uploadFiles = async (files: File[]) => {
        const pdfFiles = files.filter(file => file.name.toLowerCase().endsWith('.pdf'));
        if (pdfFiles.length === 0) return;
        await processQueue(pdfFiles);
    };

    const confirmUpload = async (file: File, force: boolean) => {
        // Re-upload with force flag
        setState(prev => ({ ...prev, uploading: true, currentFile: file.name }));
        const result = await uploadSingleFile(file, force);

        // Update the specific result in the list
        setState(prev => ({
            ...prev,
            uploading: false,
            results: prev.results.map(r => r.fileName === file.name ? result : r)
        }));
    };

    const cancelUpload = () => {
        if (abortController) {
            abortController.abort();
        }
        setState(prev => ({ ...prev, uploading: false, currentFile: 'בוטל' }));
    };

    const closeUploadWindow = () => {
        setState(prev => ({ ...prev, isOpen: false }));
    };

    const openUploadWindow = () => {
        setState(prev => ({ ...prev, isOpen: true }));
    };

    const clearResults = () => {
        setState(prev => ({ ...prev, results: [], progress: 0, total: 0 }));
    };

    return (
        <UploadContext.Provider value={{
            ...state,
            uploadFiles,
            confirmUpload,
            cancelUpload,
            closeUploadWindow,
            openUploadWindow,
            clearResults,
        }}>
            {children}
        </UploadContext.Provider>
    );
}

export const useUpload = () => {
    const context = useContext(UploadContext);
    if (context === undefined) {
        throw new Error('useUpload must be used within an UploadProvider');
    }
    return context;
};
