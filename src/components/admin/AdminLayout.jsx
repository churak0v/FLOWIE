
import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { List, Grid, Settings, BarChart2 } from 'lucide-react';

export const AdminLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (path) => location.pathname === path;

    return (
        <div
            style={{
                background: '#F5F5F5',
                minHeight: 'var(--app-vh)',
                paddingBottom: 'calc(80px + var(--app-inset-bottom))',
                fontFamily: 'Inter, sans-serif',
            }}
        >
            <div
                style={{
                    padding: '16px 20px',
                    paddingTop: 'calc(16px + var(--app-inset-top))',
                    paddingLeft: 'calc(20px + var(--app-inset-left))',
                    paddingRight: 'calc(20px + var(--app-inset-right))',
                    background: 'white',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                }}
            >
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Магазин</h1>
            </div>

            <Outlet />

            {/* Bottom Admin Navigation */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'white',
                borderTop: '1px solid #E5E5EA',
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center',
                height: 'calc(80px + var(--app-nav-inset-bottom))',
                paddingBottom: 'calc(20px + var(--app-nav-inset-bottom))',
                zIndex: 100
            }}>
                <div onClick={() => navigate('/admin/orders')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', color: isActive('/admin/orders') ? '#EB712E' : '#8E8E93' }}>
                    <List size={24} />
                    <span style={{ fontSize: 10, marginTop: 4, fontWeight: 600 }}>Заказы</span>
                </div>
                <div onClick={() => navigate('/admin/products')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', color: isActive('/admin/products') ? '#EB712E' : '#8E8E93' }}>
                    <Grid size={24} />
                    <span style={{ fontSize: 10, marginTop: 4, fontWeight: 600 }}>Товары</span>
                </div>
                <div onClick={() => navigate('/admin/stats')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', color: isActive('/admin/stats') ? '#EB712E' : '#8E8E93' }}>
                    <BarChart2 size={24} />
                    <span style={{ fontSize: 10, marginTop: 4, fontWeight: 600 }}>Статистика</span>
                </div>
                <div onClick={() => navigate('/admin/settings')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', color: isActive('/admin/settings') ? '#EB712E' : '#8E8E93' }}>
                    <Settings size={24} />
                    <span style={{ fontSize: 10, marginTop: 4, fontWeight: 600 }}>Настройки</span>
                </div>
            </div>
        </div>
    );
};
