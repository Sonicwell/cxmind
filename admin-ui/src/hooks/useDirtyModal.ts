import { useState, useCallback } from 'react';

/**
 * 表单 Modal 脏检查: 追踪表单是否有未保存修改，未保存时拦截关闭并弹出二次确认。
 *
 * 使用:
 *   const modal = useDirtyModal();
 *   <GlassModal open={modal.isOpen} onCloseAttempt={modal.attemptClose}>
 *     <input onChange={() => modal.markDirty()} />
 *   </GlassModal>
 *   <ConfirmModal open={modal.showConfirm} onClose={modal.cancelClose} onConfirm={modal.confirmClose} />
 */
export function useDirtyModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const open = useCallback(() => {
        setIsOpen(true);
        setIsDirty(false);
        setShowConfirm(false);
    }, []);

    const markDirty = useCallback(() => {
        setIsDirty(true);
    }, []);

    // 外部尝试关闭 (ESC / 区域外点击 / X 按钮)
    const attemptClose = useCallback(() => {
        if (isDirty) {
            setShowConfirm(true);
        } else {
            setIsOpen(false);
        }
    }, [isDirty]);

    // 二次确认: 放弃修改
    const confirmClose = useCallback(() => {
        setShowConfirm(false);
        setIsOpen(false);
        setIsDirty(false);
    }, []);

    // 二次确认: 取消，留在表单
    const cancelClose = useCallback(() => {
        setShowConfirm(false);
    }, []);

    // 保存成功后强制关闭（跳过 dirty 检查）
    const forceClose = useCallback(() => {
        setIsOpen(false);
        setIsDirty(false);
        setShowConfirm(false);
    }, []);

    return {
        isOpen, isDirty, showConfirm,
        open, markDirty, attemptClose, confirmClose, cancelClose, forceClose,
        // 直接操作（escape hatch）
        setIsOpen, setIsDirty
    };
}
