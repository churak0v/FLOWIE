
import React, { useState } from 'react';
import { ADMIN_STATS } from '../../data/mock';
import { BarChart2, TrendingUp, Star, Users } from 'lucide-react';

export const AdminStats = () => {
    const [period, setPeriod] = useState('day');
    const data = ADMIN_STATS[period];

    const StatCard = ({ title, value, sub, icon: Icon, color }) => (
        <div style={{ background: 'white', padding: 16, borderRadius: 20, flex: 1, minWidth: 140, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} color={color} />
                </div>
            </div>
            <div style={{ fontSize: 13, color: '#8E8E93', fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: '#34C759', fontWeight: 600, marginTop: 4 }}>{sub}</div>}
        </div>
    );

    return (
        <div style={{ padding: 16 }}>
            {/* Period Toggles */}
            <div style={{ display: 'flex', background: '#EEEBEA', padding: 4, borderRadius: 16, marginBottom: 24 }}>
                {['day', 'week', 'month'].map(p => (
                    <div
                        key={p}
                        onClick={() => setPeriod(p)}
                        style={{
                            flex: 1,
                            textAlign: 'center',
                            padding: '8px 0',
                            borderRadius: 12,
                            background: period === p ? 'white' : 'transparent',
                            boxShadow: period === p ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                        }}
                    >
                        {p === 'day' ? 'День' : p === 'week' ? 'Неделя' : 'Месяц'}
                    </div>
                ))}
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <StatCard
                    title="Оборот"
                    value={`${data.turnover.toLocaleString()} ₽`}
                    sub="+12%"
                    icon={TrendingUp}
                    color="#EB712E"
                />
                <StatCard
                    title="Средний чек"
                    value={`${data.avgCheck.toLocaleString()} ₽`}
                    icon={BarChart2}
                    color="#007AFF"
                />
                <StatCard
                    title="Рейтинг"
                    value={data.rating}
                    icon={Star}
                    color="#FF9F0A"
                />
                <StatCard
                    title="Конверсия"
                    value={`${data.conversion}%`}
                    icon={Users}
                    color="#AF52DE"
                />
            </div>

            {/* Simple Visual Chart */}
            <div style={{ marginTop: 24, background: 'white', padding: 20, borderRadius: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Динамика продаж</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 150 }}>
                    {data.chart.map((val, i) => (
                        <div key={i} style={{ width: '12%', background: '#EB712E', borderRadius: '8px 8px 0 0', height: `${val}%`, opacity: 0.8 }} />
                    ))}
                </div>
            </div>
        </div>
    );
};
