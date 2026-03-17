/**
 * ModuleRoute — 前端路由级模块守卫
 *
 * 当模块被禁用时, 阻止用户通过直接输入URL访问对应页面
 * 行为: 重定向到 /dashboard + toast 提示
 *
 * 用法: <Route path="inbox" element={<ModuleRoute module="inbox"><Omnichannel /></ModuleRoute>} />
 */
import { Navigate } from 'react-router-dom';
import { useModules } from '../../context/ModuleContext';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

interface ModuleRouteProps {
    module: string;
    children: React.ReactNode;
}

export const ModuleRoute = ({ module, children }: ModuleRouteProps) => {
    const { isModuleEnabled, loading } = useModules();
    const toastFired = useRef(false);

    const enabled = loading ? true : isModuleEnabled(module);

    // toast 需要在 effect 中触发，避免 render 阶段副作用
    useEffect(() => {
        if (!loading && !enabled && !toastFired.current) {
            toastFired.current = true;
            toast.error(`Module "${module}" is not enabled`, { id: `module-guard-${module}` });
        }
    }, [loading, enabled, module]);

    if (loading) return null;
    if (!enabled) return <Navigate to="/dashboard" replace />;
    return <>{children}</>;
};
