import React from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Container, Typography, Box, Alert, Skeleton, Grid, Paper, Chip, List, ListItem, ListItemText, Divider } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface GameDetails {
    id: string;
    start_time: string;
    end_time: string;
    duration_seconds: number;
    game_type: string;
    winner_username?: string;
    loser_username?: string;
}
interface GameParticipant {
    user_id: number;
    username: string;
    outcome: string;
    cards_at_end: number;
    cards_taken_total: number;
    is_first_attacker: boolean;
}
interface GameDetailsResponse {
    details: GameDetails;
    participants: GameParticipant[];
}

const fetchGameDetails = async (gameId: string): Promise<GameDetailsResponse> => {
    const { data } = await axios.get(`${API_BASE_URL}/api/admin/games/${gameId}/details`, {
        withCredentials: true,
    });
    return data;
};

const GameDetailPage: React.FC = () => {
    const { gameId } = useParams<{ gameId: string }>();

    const { data, isLoading, error } = useQuery({
        queryKey: ['gameDetails', gameId],
        queryFn: () => fetchGameDetails(gameId!),
        enabled: !!gameId,
    });

    const participantsColumns: GridColDef[] = [
        { field: 'username', headerName: 'Гравець', flex: 1, minWidth: 150, renderCell: params => params.value || 'Гість' },
        { field: 'outcome', headerName: 'Результат', width: 130, renderCell: params => <Chip label={params.value} color={params.value === 'win' ? 'success' : (params.value === 'loss' ? 'error' : 'default')} size="small"/> },
        { field: 'cards_at_end', headerName: 'Карт в кінці', type: 'number', width: 120 },
        { field: 'cards_taken_total', headerName: 'Карт взято', type: 'number', width: 120 },
        { field: 'is_first_attacker', headerName: 'Перший хід', type: 'boolean', width: 120 },
    ];

    if (isLoading) {
        return <Container maxWidth="md" sx={{ py: 2 }}><Skeleton variant="rectangular" height={500} /></Container>;
    }

    if (error) {
        return <Container maxWidth="md" sx={{ py: 2 }}><Alert severity="error">{(error as any).message || "Помилка завантаження деталей гри."}</Alert></Container>;
    }

    if (!data) return null;

    const { details, participants } = data;

    return (
        <Container maxWidth="md" sx={{ py: 2 }}>
            <Box sx={{ mb: 3 }}>
                <RouterLink to="/games-history" style={{ textDecoration: 'none' }}>
                    <Chip icon={<ArrowBackIcon />} label="До історії ігор" clickable />
                </RouterLink>
                <Typography variant="h4" sx={{ mt: 2 }}>
                    Деталі гри: <Typography component="span" variant="h4" color="primary.main" sx={{ fontFamily: 'monospace' }}>{details.id}</Typography>
                </Typography>
            </Box>

            <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Основна інформація</Typography>
                <List dense>
                    <ListItem><ListItemText primary="Тип гри" secondary={details.game_type} /></ListItem>
                    <ListItem><ListItemText primary="Переможець" secondary={details.winner_username || 'Нічия'} /></ListItem>
                    <ListItem><ListItemText primary="Програвший" secondary={details.loser_username || 'Немає'} /></ListItem>
                    <ListItem><ListItemText primary="Тривалість" secondary={`${details.duration_seconds} сек`} /></ListItem>
                    <ListItem><ListItemText primary="Завершено" secondary={new Date(details.end_time).toLocaleString()} /></ListItem>
                </List>
            </Paper>

            <Paper sx={{ p: 2, borderRadius: 4 }}>
                <Typography variant="h6" gutterBottom>Учасники</Typography>
                <Box sx={{ height: 300, width: '100%' }}>
                    <DataGrid
                        rows={participants.map(p => ({...p, id: p.user_id || `bot-${Math.random()}`}))}
                        columns={participantsColumns}
                        density="compact"
                    />
                </Box>
            </Paper>
        </Container>
    );
};

export default GameDetailPage;