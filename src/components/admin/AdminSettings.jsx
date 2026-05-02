
import React from 'react';
import { ToggleLeft, Bell, HelpCircle, LogOut } from 'lucide-react';

export const AdminSettings = () => {
    const SettingItem = ({ icon: Icon, label, value }) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid #F5F5F5' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, background: '#F5F5F5', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} color="#000" />
                </div>
                <span style={{ fontSize: 16, fontWeight: 500 }}>{label}</span>
            </div>
            {value}
        </div>
    );

    return (
        <div style={{ padding: 16, background: 'white', borderRadius: 20, margin: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Настройки магазина</h2>

            <SettingItem
                icon={ToggleLeft}
                label="Статус магазина"
                value={<span style={{ color: '#34C759', fontWeight: 700 }}>Открыт</span>}
            />
            <SettingItem
                icon={Bell}
                label="Уведомления"
                value={<div style={{ width: 40, height: 24, background: '#EB712E', borderRadius: 12, position: 'relative' }}><div style={{ width: 20, height: 20, background: 'white', borderRadius: '50%', position: 'absolute', top: 2, right: 2 }} /></div>}
            />
            <SettingItem
                icon={HelpCircle}
                label="Помощь"
                value={<span style={{ color: '#8E8E93' }}>v1.0.0</span>}
            />
            <SettingItem
                icon={LogOut}
                label="Выйти"
                value={null}
            />
        </div>
    );
};
