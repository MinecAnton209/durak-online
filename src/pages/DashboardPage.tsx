import React, { useEffect, useState } from 'react';
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
import { alpha } from '@mui/material/styles';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import VideogameAssetIcon from '@mui/icons-material/VideogameAsset';
import OnlinePredictionIcon from '@mui/icons-material/OnlinePrediction';
import TodayIcon from '@mui/icons-material/Today';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

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

const DashboardPage: React.FC = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    console.log('[DashboardPage] Рендер компонента. loading:', loading, 'stats:', stats, 'error:', error);

    useEffect(() => {
        const fetchDashboardStats = async () => {
            console.log('[DashboardPage] useEffect: Починаємо fetchDashboardStats');
            setLoading(true);
            setError(null);
            try {
                const response = await axios.get<DashboardStats>(
                    `${API_BASE_URL}/api/admin/stats/dashboard-overview`,
                    {
                        withCredentials: true,
                    }
                );
                setStats(response.data);
                console.log('[DashboardPage] useEffect: Дані отримано:', response.data);
            } catch (err: any) {
                if (axios.isAxiosError(err) && err.response) {
                    setError(
                        err.response.data.message ||
                        err.response.data.error ||
                        'Помилка завантаження статистики.'
                    );
                    console.error('[DashboardPage] useEffect: Помилка завантаження:', err);
                } else {
                    setError('Не вдалося підключитися до сервера.');
                }
                console.error('Fetch dashboard stats error:', err);
            } finally {
                setLoading(false);
                console.log('[DashboardPage] useEffect: setLoading(false)');
            }
        };

        fetchDashboardStats();
    }, []);

    if (loading && !stats) {
        console.log('[DashboardPage] Рендеримо скелетони...');
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Typography variant="h4" sx={{ mb: 3, mt: 0 }}>
                    <Skeleton variant="text" width={250} />
                </Typography>
                <Grid container spacing={3}>
                    {[...Array(4)].map((_, index) => (
                        <Grid component="div" item xs={12} sm={6} md={3} key={index}>
                            <Card sx={{ borderRadius: '16px', p: 2.5, height: 160 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                                    <Skeleton variant="rectangular" width={40} height={40} sx={{ borderRadius: '12px', mr: 1.5 }} />
                                    <Skeleton variant="text" width="60%" />
                                </Box>
                                <Skeleton variant="text" width="40%" height={40} sx={{ mb: 1 }} />
                                <Skeleton variant="text" width="80%" />
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            </Container>
        );
    }

    if (error) {
        console.log('[DashboardPage] Рендеримо помилку:', error);
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                </Alert>
            </Container>
        );
    }

    if (!stats) {
        console.log('[DashboardPage] Рендеримо "Немає даних"...');
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Typography sx={{ mt: 2 }}>Немає даних для відображення.</Typography>
            </Container>
        );
    }
    console.log('[DashboardPage] Рендеримо картки зі статистикою:', stats);

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
                    <Grid xs={12} sm={6} md={3} key={index}> 
                        <Card sx={{
                            borderRadius: '16px',
                            boxShadow: '0px 5px 15px rgba(0, 0, 0, 0.05)',
                            p: 2.5,
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                        }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <Box sx={{
                                        p: 0.75,
                                        backgroundColor: (theme) => alpha(theme.palette[item.icon.props.color || 'primary'].main, 0.12),
                                        borderRadius: '12px',
                                        display: 'inline-flex',
                                        mb: 0.5,
                                    }}>
                                        {React.cloneElement(item.icon, { sx: { ...item.icon.props.sx, fontSize: 28 } })}
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 'medium' }}>
                                        {item.title}
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="h4" component="div" fontWeight="bold">
                                        {item.value.toLocaleString()}
                                    </Typography>
                                    <Typography variant="caption" color="text.disabled" component="div" sx={{ height: '20px' }}>
                                    </Typography>
                                </Box>
                            </Box>
                            <Box sx={{ flexGrow: 1, mt: 2, minHeight: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography variant="caption" color="text.disabled">
                                    (графік тут)
                                </Typography>
                            </Box>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Box sx={{ mt: 5 }}>
                <Typography variant="h5" sx={{ mb: 2 }}>
                    Детальна Аналітика (в розробці)
                </Typography>
                <Paper elevation={0} sx={{ p: 3, borderRadius: '16px', backgroundColor: (theme) => theme.palette.background.paper }}>
                    <Typography>
                        Графіки активності користувачів, популярності ігор та інші корисні дані з'являться тут незабаром. Для графіків можна буде використати бібліотеку типу Recharts або Chart.js.
                    </Typography>
                </Paper>
            </Box>
        </Container>
    );
};

export default DashboardPage;