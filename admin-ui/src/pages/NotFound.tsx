import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';

export const NotFound: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
            <h1 className="text-6xl font-bold text-[var(--accent-primary)] mb-4">404</h1>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
                {t('common.notFound.title', 'Page Not Found')}
            </h2>
            <p className="text-[var(--text-secondary)] mb-8 max-w-md">
                {t('common.notFound.message', 'The page you are looking for does not exist, has been removed, or you do not have permission to access it.')}
            </p>
            <div className="flex gap-4">
                <Button
                    variant="outline"
                    onClick={() => navigate(-1)}
                >
                    {t('common.back', 'Go Back')}
                </Button>
                <Button
                    variant="default"
                    onClick={() => navigate('/')}
                >
                    {t('common.home', 'Go to Dashboard')}
                </Button>
            </div>
        </div>
    );
};
