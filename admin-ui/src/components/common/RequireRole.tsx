import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface RequireRoleProps {
    allowedRoles: string[];
    children: React.ReactNode;
}

/**
 * A wrapper for routes or components that require specific roles.
 * If the user's role is not in the allowedRoles array, they are redirected
 * or a fallback UI is shown (currently redirects to /dashboard).
 */
export const RequireRole: React.FC<RequireRoleProps> = ({ allowedRoles, children }) => {
    const { user, isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '2rem' }}>
                <div style={{
                    width: 24, height: 24,
                    border: '2px solid rgba(255,255,255,0.1)',
                    borderTop: '2px solid var(--primary, #6366f1)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                }} />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Role check logic. Assume user.role is a string (e.g., 'admin', 'supervisor', 'user')
    // and let's assume 'admin' can access anything, or strictly check allowedRoles.
    // For now, doing a strict check + allowing 'admin' by default if needed.
    // Make it case-insensitive for safety.
    const userRole = (user?.role || '').toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

    const hasAccess = normalizedAllowedRoles.includes(userRole) || userRole === 'admin' || userRole === 'superadmin';

    if (!hasAccess) {
        // Redirect to a dashboard or show an unauthorized message
        // Here we redirect to dashboard, but you could also rent a 403 page
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};
