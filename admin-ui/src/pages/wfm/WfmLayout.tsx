import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import classes from './WfmLayout.module.css';
import { useTranslation } from 'react-i18next';
import {
    Calendar,
    Activity,
    Users,
    Settings
} from 'lucide-react';

const WfmLayout: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className={classes.wfmContainer}>
            {/* WFM Sub-navigation header */}
            <header className={classes.wfmHeader}>
                <div className={classes.headerLeft}>
                    <h1>{t('wfm.title')}</h1>
                    <p>{t('wfm.subtitle')}</p>
                </div>

                <nav className={classes.wfmNav}>
                    <NavLink
                        to="/wfm/schedule"
                        className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
                    >
                        <Calendar className={classes.navIcon} />
                        {t('wfm.schedule')}
                    </NavLink>
                    <NavLink
                        to="/wfm/adherence"
                        className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
                    >
                        <Activity className={classes.navIcon} />
                        {t('wfm.adherence')}
                    </NavLink>
                    <NavLink
                        to="/wfm/approvals"
                        className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
                    >
                        <Users className={classes.navIcon} />
                        {t('wfm.approvals')}
                    </NavLink>
                    <NavLink
                        to="/wfm/settings"
                        className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
                    >
                        <Settings className={classes.navIcon} />
                        {t('wfm.templatesSettings')}
                    </NavLink>
                </nav>
            </header>

            {/* WFM Content Area */}
            <main className={classes.wfmContent}>
                <Outlet />
            </main>
        </div>
    );
};

export default WfmLayout;
