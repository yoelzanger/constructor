'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function VisitLogger() {
    const pathname = usePathname();

    useEffect(() => {
        const logVisit = async () => {
            try {
                await fetch('/api/activity-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        activityType: 'site_visit',
                        description: `ביקור בדף: ${pathname}`,
                        details: { pathname },
                    }),
                });
            } catch (err) {
                // Silently ignore logging errors on client
                console.error('Failed to log visit:', err);
            }
        };

        logVisit();
    }, [pathname]);

    return null;
}
