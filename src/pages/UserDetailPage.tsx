import React from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
    Container, Typography, Box, Alert, Skeleton, Grid, Paper, Chip, List, ListItem, ListItemText, ListItemAvatar, Avatar, Divider, Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

const API_BASE_URL = 'http://localhost:3000';

interface UserDetails {
    id: number;
    username: string;
    wins: number;
    losses: number;
    streak_count: number;
    is_verified: boolean;
    is_admin: boolean;
    is_banned: boolean;
    ban_reason?: string;
    is_muted: boolean;
    last_played_date?: string;
}
interface UserGame {
    id: string;
    end_time: string;
    game_type: string;
    outcome: string;
    cards_at_end: number;
}
interface UserAchievement {
    achievement_code: string;
    unlocked_at: string;
    name_key: string;
    rarity: string;
}
interface UserDetailsResponse {
    details: UserDetails;
    games: UserGame[];
    achievements: UserAchievement[];
}

const fetchUserDetails = async (userId: string): Promise<UserDetailsResponse> => {
    const { data } = await axios.get<UserDetailsResponse>(`${API_BASE_URL}/api/admin/users/${userId}/details`, {
        withCredentials: true,
    });
    return data;
};

const UserDetailPage: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();

    const { data, isLoading, error } = useQuery({
        queryKey: ['userDetails', userId],
        queryFn: () => fetchUserDetails(userId!),
        enabled: !!userId,
    });

    if (isLoading) {
        return (
            <Container maxWidth="lg" sx={{ py: 2 }}>
                <Skeleton variant="text" width={300} height={60} />
                <Grid container spacing={3} sx={{ mt: 1 }}>
                    <Grid item xs={12} md={4}>
                        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 4 }} />
                    </Grid>
                    <Grid item xs={12} md={8}>
                        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 4 }} />
                    </Grid>
                </Grid>
            </Container>
        );
    }

    if (error) {
        return <Container maxWidth="lg" sx={{ py: 2 }}><Alert severity="error">{(error as any).message || "Помилка завантаження даних користувача."}</Alert></Container>;
    }
    
    if (!data) return null;

    const { details, games, achievements } = data;
    
    const gamesColumns: GridColDef[] = [
        { field: 'id', headerName: 'ID Гри', width: 130 },
        { field: 'outcome', headerName: 'Результат', width: 120, renderCell: params => <Chip label={params.value} color={params.value === 'win' ? 'success' : 'error'} size="small"/> },
        { field: 'game_type', headerName: 'Тип', width: 130 },
        { field: 'cards_at_end', headerName: 'Карт в кінці', type: 'number', width: 120 },
        { field: 'end_time', headerName: 'Завершено', flex: 1, minWidth: 180, renderCell: params => new Date(params.value).toLocaleString() }
    ];

    return (
        <Container maxWidth="lg" sx={{ py: 2 }}>
            <Box sx={{ mb: 3 }}>
                 <RouterLink to="/users" style={{ textDecoration: 'none' }}>
                    <Chip icon={<ArrowBackIcon />} label="До списку користувачів" clickable />
                </RouterLink>
                <Typography variant="h4" sx={{ mt: 2 }}>
                    Профіль: {details.username} {details.is_verified && '✔️'} {details.is_admin && '👑'}
                </Typography>
                {details.is_banned && <Chip label={`ЗАБАНЕНИЙ: ${details.ban_reason || 'Причина не вказана'}`} color="error" sx={{mt: 1}}/>}
                {details.is_muted && <Chip label="ЧАТ ПРИГЛУШЕНО" color="warning" sx={{mt: 1, ml: details.is_banned ? 1 : 0}}/>}
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, borderRadius: 4 }}>
                        <Typography variant="h6" gutterBottom>Основна інформація</Typography>
                        <List dense>
                            <ListItem><ListItemText primary="ID" secondary={details.id} /></ListItem>
                            <ListItem><ListItemText primary="Перемог" secondary={details.wins} /></ListItem>
                            <ListItem><ListItemText primary="Поразок" secondary={details.losses} /></ListItem>
                            <ListItem><ListItemText primary="Стрік" secondary={details.streak_count} /></ListItem>
                            <ListItem><ListItemText primary="Остання гра" secondary={details.last_played_date ? new Date(details.last_played_date).toLocaleDateString() : 'Ніколи'} /></ListItem>
                        </List>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 2, borderRadius: 4, mb: 3 }}>
                        <Typography variant="h6" gutterBottom>Історія останніх ігор</Typography>
                         <Box sx={{ height: 400, width: '100%' }}>
                            <DataGrid rows={games} columns={gamesColumns} pageSizeOptions={[5, 10]} initialState={{pagination: { paginationModel: { pageSize: 5 }}}} density="compact" />
                        </Box>
                    </Paper>

                    <Paper sx={{ p: 2, borderRadius: 4 }}>
                        <Typography variant="h6" gutterBottom>Отримані досягнення ({achievements.length})</Typography>
                        <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                            {achievements.length > 0 ? achievements.map(ach => (
                                <ListItem key={ach.achievement_code}>
                                    <ListItemAvatar>
                                        <Avatar sx={{ bgcolor: `${ach.rarity === 'legendary' ? 'secondary.main' : 'primary.main'}` }}>
                                            <Tooltip title={ach.rarity}><EmojiEventsIcon /></Tooltip>
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText 
                                        primary={ach.name_key} 
                                        secondary={`Отримано: ${new Date(ach.unlocked_at).toLocaleString()}`}
                                    />
                                </ListItem>
                            )) : <Typography variant="body2" color="text.secondary">Немає отриманих досягнень.</Typography>}
                        </List>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
};

export default UserDetailPage;