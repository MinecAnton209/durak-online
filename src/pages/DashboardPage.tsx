import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
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
import {
    LineChart, Line,
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const formatDateForAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
};

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
    const { data } = await axios.get(`${API_BASE_URL}/api/admin/stats/dashboard-overview`, { withCredentials: true });
    return data;
};
const fetchRegistrationsChartData = async (): Promise<ChartData[]> => {
    const { data } = await axios.get(`${API_BASE_URL}/api/admin/stats/registrations-by-day`, { withCredentials: true });
    return data;
};
const fetchGamesChartData = async (): Promise<ChartData[]> => {
    const { data } = await axios.get(`${API_BASE_URL}/api/admin/stats/games-by-day`, { withCredentials: true });
    return data;
};

const DashboardPage: React.FC = () => {
    const theme = useTheme();

    const {
        data: stats,
        isLoading: isLoadingStats,
        error: statsError
    } = useQuery({
        queryKey: ['dashboardStats'],
        queryFn: fetchDashboardStats,
    });

    const {
        data: registrationsData,
        isLoading: isLoadingRegistrations,
        error: registrationsError
    } = useQuery({
        queryKey: ['registrationsChart'],
        queryFn: fetchRegistrationsChartData,
    });

    const {
        data: gamesData,
        isLoading: isLoadingGames,
        error: gamesError
    } = useQuery({
        queryKey: ['gamesChart'],
        queryFn: fetchGamesChartData,
    });

    const isLoading = isLoadingStats || isLoadingRegistrations || isLoadingGames;
    const error = statsError || registrationsError || gamesError;

    if (isLoading && !stats) {
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Typography variant="h4" sx={{ mb: 3, mt: 0 }}><Skeleton variant="text" width={250} /></Typography>
                <Grid container spacing={3}>
                    {[...Array(5)].map((_, index) => (
                        <Grid item xs={12} sm={6} md={2.4} key={index}>
                            <Skeleton variant="rectangular" height={130} sx={{ borderRadius: '16px' }} />
                        </Grid>
                    ))}
                </Grid>
                <Grid container spacing={3} sx={{ mt: 2 }}>
                    <Grid item xs={12} lg={6}><Skeleton variant="rectangular" height={350} sx={{ borderRadius: '16px' }} /></Grid>
                    <Grid item xs={12} lg={6}><Skeleton variant="rectangular" height={350} sx={{ borderRadius: '16px' }} /></Grid>
                </Grid>
            </Container>
        );
    }

    if (error) {
        return <Container maxWidth="xl" sx={{ py: 2 }}><Alert severity="error">{(error as any).message || "Помилка завантаження даних для дашборду."}</Alert></Container>;
    }

    if (!stats) {
        return <Container maxWidth="xl" sx={{ py: 2 }}><Typography sx={{ mt: 2 }}>Немає даних для відображення.</Typography></Container>;
    }

    const statItems = [
        { title: 'Загалом користувачів', value: stats.totalUsers, icon: <PeopleAltIcon color="primary" /> as React.ReactElement<StatItemIconProps> },
        { title: 'Активних ігор', value: stats.activeGames, icon: <VideogameAssetIcon color="secondary" /> as React.ReactElement<StatItemIconProps> },
        { title: 'Онлайн зараз', value: stats.onlineUsers, icon: <OnlinePredictionIcon color="success" /> as React.ReactElement<StatItemIconProps> },
        { title: 'Ігор сьогодні', value: stats.gamesPlayedToday, icon: <TodayIcon color="info" /> as React.ReactElement<StatItemIconProps> },
        { title: 'Реєстрацій сьогодні', value: stats.newRegistrationsToday, icon: <PersonAddIcon color="warning" /> as React.ReactElement<StatItemIconProps> },
    ];

    return (
        <Container maxWidth={false} sx={{ py: 2, px: { xs: 2, sm: 3 } }}>
            <Typography variant="h4" sx={{ mb: 3, mt: 0 }}>
                Огляд Системи
            </Typography>
            
            <Grid container spacing={3}>
                {statItems.map((item, index) => (
                    <Grid item xs={12} sm={6} md={4} lg={2.4} key={index}>
                        <Card sx={{
                            p: 2,
                            borderRadius: '16px',
                            height: '100%',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                        }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 'medium' }}>
                                        {item.title}
                                    </Typography>
                                    <Typography variant="h4" component="div" fontWeight="bold">
                                        {(item.value ?? 0).toLocaleString()}
                                    </Typography>
                                </Box>
                                <Box sx={{
                                    p: 1.5,
                                    backgroundColor: alpha(theme.palette[item.icon.props.color || 'primary'].main, 0.12),
                                    borderRadius: '50%'
                                }}>
                                    {React.cloneElement(item.icon, { sx: { ...item.icon.props.sx, fontSize: 28, color: `${item.icon.props.color || 'primary'}.main` }})}
                                </Box>
                            </Box>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Box sx={{ mt: 4 }}>
                <Box mb={4}>
                    <Typography variant="h6" sx={{ mb: 2 }}>Нові реєстрації (7 днів)</Typography>
                    <Paper elevation={0} sx={{ p: { xs: 1, sm: 2 }, borderRadius: '16px', backgroundColor: theme.palette.background.paper, height: 350 }}>
                        {isLoadingRegistrations ? (
                            <Skeleton variant="rectangular" width="100%" height="100%" sx={{ borderRadius: '16px' }} />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={registrationsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                                    <XAxis dataKey="date" stroke={theme.palette.text.secondary} tick={{ fontSize: 12 }} tickFormatter={(tick) => new Date(tick).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} />
                                    <YAxis stroke={theme.palette.text.secondary} tick={{ fontSize: 12 }} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: theme.palette.background.paper,
                                            border: `1px solid ${theme.palette.divider}`,
                                            borderRadius: '12px'
                                        }}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="count" name="Реєстрації" stroke={theme.palette.primary.main} strokeWidth={2} activeDot={{ r: 6 }} dot={{ r: 3 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </Paper>
                </Box>

                <Box>
                    <Typography variant="h6" sx={{ mb: 2 }}>Зіграно ігор (7 днів)</Typography>
                    <Paper elevation={0} sx={{ p: { xs: 1, sm: 2 }, borderRadius: '16px', backgroundColor: theme.palette.background.paper, height: 350 }}>
                        {isLoadingGames ? (
                            <Skeleton variant="rectangular" width="100%" height="100%" sx={{ borderRadius: '16px' }} />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={gamesData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                                    <XAxis dataKey="date" stroke={theme.palette.text.secondary} tick={{ fontSize: 12 }} tickFormatter={(tick) => new Date(tick).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} />
                                    <YAxis stroke={theme.palette.text.secondary} tick={{ fontSize: 12 }} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: theme.palette.background.paper,
                                            border: `1px solid ${theme.palette.divider}`,
                                            borderRadius: '12px'
                                        }}
                                        cursor={{ fill: alpha(theme.palette.secondary.main, 0.1) }}
                                    />
                                    <Legend />
                                    <Bar dataKey="count" name="Ігри" fill={theme.palette.secondary.main} radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </Paper>
                </Box>
            </Box>
        </Container>
    );
};

export default DashboardPage;