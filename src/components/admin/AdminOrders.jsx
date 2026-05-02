
import React, { useState } from 'react';
import { ADMIN_ORDERS } from '../../data/mock';
import { ChevronRight, Clock, MapPin } from 'lucide-react';

export const AdminOrders = () => {
    const [activeTab, setActiveTab] = useState('Today');

    // Filter logic
    const filteredOrders = ADMIN_ORDERS.filter(order => {
        if (activeTab === 'Today') return order.date === 'Today' && order.status !== 'completed';
        if (activeTab === 'Tomorrow') return order.date === 'Tomorrow';
        if (activeTab === 'Completed') return order.status === 'completed';
        // 'Other' catch-all or specific logic
        return true;
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'new': return '#EB712E'; // Orange
            case 'delivery': return '#34C759'; // Green
            case 'completed': return '#8E8E93'; // Gray
            default: return '#000';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'new': return 'Новый';
            case 'delivery': return 'Доставляется';
            case 'completed': return 'Завершен';
            default: return status;
        }
    };

    return (
        <div style={{ padding: 16 }}>
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 16 }} className="hide-scrollbar">
                {['Today', 'Tomorrow', 'Completed', 'Other'].map(tab => (
                    <div
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '8px 16px',
                            background: activeTab === tab ? '#000' : '#EEEBEA',
                            color: activeTab === tab ? '#fff' : '#000',
                            borderRadius: 20,
                            fontWeight: 600,
                            fontSize: 14,
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                        }}
                    >
                        {tab === 'Today' ? 'Сегодня' : tab === 'Tomorrow' ? 'Завтра' : tab === 'Completed' ? 'Выполненные' : 'Другие'}
                    </div>
                ))}
            </div>

            {/* Orders List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredOrders.length === 0 && (
                    <div style={{ textAlign: 'center', marginTop: 40, color: '#8E8E93' }}>Нет заказов</div>
                )}
                {filteredOrders.map(order => (
                    <div key={order.id} style={{ background: 'white', borderRadius: 20, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: getStatusColor(order.status) }} />
                                <span style={{ fontWeight: 700, fontSize: 16 }}>#{order.id}</span>
                                <span style={{ fontSize: 14, color: '#8E8E93' }}>{order.time}</span>
                            </div>
                            <div style={{ background: order.payment === 'paid' ? '#E8F5E9' : '#FFF3E0', color: order.payment === 'paid' ? '#2E7D32' : '#E65100', padding: '4px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                                {order.payment === 'paid' ? 'Оплачен' : 'Не оплачен'}
                            </div>
                        </div>

                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>{order.items.join(', ')}</div>
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, color: '#8E8E93', fontSize: 14 }}>
                                <MapPin size={14} />
                                <span>Москва, Большая Спасская...</span>
                            </div>
                        </div>

                        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #F5F5F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: 18 }}>{order.total} ₽</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#EB712E', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                                <span>Подробнее</span>
                                <ChevronRight size={16} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
