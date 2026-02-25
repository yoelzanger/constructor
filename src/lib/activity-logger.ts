import { prisma } from '@/lib/db';

/**
 * Resolves city name from an IP address using ip-api.com (free, no key required).
 * Returns null on any failure so logging is never blocked.
 */
async function getCityFromIp(ip: string): Promise<string | null> {
    // Skip private/loopback addresses
    if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return 'Local';
    }
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,status`, {
            signal: AbortSignal.timeout(2000), // 2-second timeout
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status === 'success' && data.city) return data.city as string;
        return null;
    } catch {
        return null;
    }
}

export interface LogActivityParams {
    activityType:
    | 'site_visit'
    | 'upload'
    | 'delete'
    | 'rollback'
    | 'config_change'
    | 'snapshot';
    description: string;
    ipAddress?: string | null;
    details?: Record<string, unknown>;
}

/**
 * Write an activity log entry to the database.
 * IP geolocation is resolved asynchronously and never throws.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
    try {
        const ip = params.ipAddress ?? null;
        const city = ip ? await getCityFromIp(ip) : null;

        await prisma.activityLog.create({
            data: {
                activityType: params.activityType,
                description: params.description,
                ipAddress: ip,
                city,
                details: params.details ? JSON.stringify(params.details) : null,
            },
        });
    } catch (err) {
        // Never let logging failures break the main request
        console.error('[ActivityLog] Failed to write log entry:', err);
    }
}

/**
 * Extract the real client IP from Next.js request headers.
 * Handles Vercel/proxy setups.
 */
export function getClientIp(headers: Headers): string | null {
    return (
        headers.get('x-real-ip') ??
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        null
    );
}
