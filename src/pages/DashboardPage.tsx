import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import {
    Container,
    Typography,
    Grid,
    Card,
    Box,
    Alert,
    Paper,
    Skeleton
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import VideogameAssetIcon from '@mui/icons-material/VideogameAsset';
import OnlinePredictionIcon from '@mui/icons-material/OnlinePrediction';
import TodayIcon from '@mui/icons-material/Today';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface DashboardStats {
    totalUsers: number;
    activeGames: number;
    onlineUsers: number;
    gamesPlayedToday: number;
    newRegistrationsToday: number;
}
interface StatItemIconProps {
    color?: "primary" | "secondary" | "success" | "info" | "error" | "warning";
    sx?: object;
}
interface ChartData {
    date: string;
    count: number;
}

const fetchDashboardStats = async (): Promise<DashboardStats> => {
    const { data } = await axios.get(`${API_BASE_URL}/api/admin/stats/dashboard-overview`, {
        withCredentials: true,
    });
    return data;
};
const fetchRegistrationsChartData = async (): Promise<ChartData[]> => {
    const { data } = await axios.get(`${API_BASE_URL}/api/admin/stats/registrations-by-day`, {
        withCredentials: true,
    });
    return data;
};

const DashboardPage: React.FC = () => {
    const theme = useTheme();

    const { data: stats, isLoading: isLoadingStats, error: statsError } = useQuery({
        queryKey: ['dashboardStats'],
        queryFn: fetchDashboardStats,
    });

    const { data: chartData, isLoading: isLoadingChart, error: chartError } = useQuery({
        queryKey: ['registrationsChart'],
        queryFn: fetchRegistrationsChartData,
    });

    const isLoading = isLoadingStats || isLoadingChart;
    const error = statsError || chartError;

    if (isLoading && !stats && !chartData) {
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Typography variant="h4" sx={{ mb: 3, mt: 0 }}>
                    <Skeleton variant="text" width={250} />
                </Typography>
                <Grid container spacing={3}>
                    {[...Array(5)].map((_, index) => (
                        <Grid xs={12} sm={6} md={2.4} key={index}>
                            <Skeleton variant="rectangular" height={160} sx={{ borderRadius: '16px' }} />
                        </Grid>
                    ))}
                </Grid>
                <Box sx={{ mt: 5 }}>
                    <Skeleton variant="text" width={400} height={40} sx={{ mb: 2 }}/>
                    <Skeleton variant="rectangular" height={400} sx={{ borderRadius: '16px' }} />
                </Box>
            </Container>
        );
    }

    if (error) {
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Alert severity="error">
                    {(error as any).message || "Помилка завантаження даних для дашборду."}
                </Alert>
            </Container>
        );
    }

    if (!stats) {
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Typography sx={{ mt: 2 }}>Немає даних для відображення.</Typography>
            </Container>
        );
    }

    const statItems = [
        { title: 'Загалом користувачів', value: stats.totalUsers, icon: <PeopleAltIcon color="primary" /> as React.ReactElement<StatItemIconProps> },
        { title: 'Активних ігор', value: stats.activeGames, icon: <VideogameAssetIcon color="secondary" /> as React.ReactElement<StatItemIconProps> },
        { title: 'Онлайн зараз', value: stats.onlineUsers, icon: <OnlinePredictionIcon color="success" /> as React.ReactElement<StatItemIconProps> },
        { title: 'Ігор зіграно сьогодні', value: stats.gamesPlayedToday, icon: <TodayIcon color="info" /> as React.ReactElement<StatItemIconProps> },
        { title: 'Нових реєстрацій сьогодні', value: stats.newRegistrationsToday, icon: <PersonAddIcon color="warning" /> as React.ReactElement<StatItemIconProps> },
    ];

    return (
        <Container maxWidth="xl" sx={{ py: 2 }}>
            <Typography variant="h4" sx={{ mb: 3, mt: 0 }}>
                Огляд Системи
            </Typography>
            
            <Grid container spacing={3}>
                {statItems.map((item, index) => (
                    <Grid xs={12} sm={6} md={2.4} key={index}>
                        <Card sx={{
                            borderRadius: '16px',
                            boxShadow: '0px 5px 15px rgba(0, 0, 0, 0.05)',
                            p: 2.5, height: '100%',
                            display: 'flex', flexDirection: 'column',
                        }}>
                             <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <Box sx={{
                                        p: 0.75,
                                        backgroundColor: alpha(theme.palette[item.icon.props.color || 'primary'].main, 0.12),
                                        borderRadius: '12px', display: 'inline-flex', mb: 0.5,
                                    }}>
                                        {React.cloneElement(item.icon, { sx: { ...item.icon.props.sx, fontSize: 28 } })}
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 'medium' }}>
                                        {item.title}
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="h4" component="div" fontWeight="bold">
                                        {(item.value ?? 0).toLocaleString()}
                                    </Typography>
                                    <Typography variant="caption" color="text.disabled" component="div" sx={{ height: '20px' }} />
                                </Box>
                            </Box>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Box sx={{ mt: 5 }}>
                <Typography variant="h5" sx={{ mb: 2 }}>
                    Нові реєстрації за останній тиждень
                </Typography>
                <Paper elevation={0} sx={{ p: { xs: 1, sm: 2, md: 3 }, borderRadius: '16px', backgroundColor: theme.palette.background.paper, height: 400 }}>
                    {isLoadingChart ? (
                        <Skeleton variant="rectangular" width="100%" height="100%" />
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                                <XAxis dataKey="date" stroke={theme.palette.text.secondary} tick={{ fontSize: 12 }} />
                                <YAxis stroke={theme.palette.text.secondary} tick={{ fontSize: 12 }} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: theme.palette.background.default,
                                        border: `1px solid ${theme.palette.divider}`,
                                        borderRadius: theme.shape.borderRadius,
                                    }}
                                    labelStyle={{ color: theme.palette.text.primary }}
                                />
                                <Legend wrapperStyle={{ fontSize: 14 }} />
                                <Line type="monotone" dataKey="count" name="Реєстрації" stroke={theme.palette.primary.main} strokeWidth={2} activeDot={{ r: 8 }} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </Paper>
            </Box>
        </Container>
    );
};

export default DashboardPage;