import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Container, Typography, Box, Alert, Skeleton, Tabs, Tab, Paper, TableContainer, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface LeaderboardEntry {
    id: number;
    username: string;
    wins: number;
    rating: number;
    win_streak: number;
    games_played: number;
}

type LeaderboardType = 'rating' | 'wins' | 'win_streak' | 'games_played';

const fetchLeaderboard = async (type: LeaderboardType): Promise<LeaderboardEntry[]> => {
    const { data } = await axios.get<LeaderboardEntry[]>(`${API_BASE_URL}/api/admin/stats/leaderboard`, {
        params: { type, limit: 100 },
        withCredentials: true,
    });
    return data;
};

const LeaderboardTable: React.FC<{ data?: LeaderboardEntry[], valueKey: keyof LeaderboardEntry, valueHeader: string }> = ({ data, valueKey, valueHeader }) => {
    const getMedal = (index: number) => {
        if (index === 0) return '🥇';
        if (index === 1) return '🥈';
        if (index === 2) return '🥉';
        return index + 1;
    };

    return (
        <TableContainer component={Paper} elevation={0}>
            <Table sx={{ minWidth: 650 }} aria-label="leaderboard table">
                <TableHead>
                    <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>Гравець</TableCell>
                        <TableCell align="right">{valueHeader}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {(data || []).map((row, index) => (
                        <TableRow key={row.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                            <TableCell component="th" scope="row" sx={{width: 50, fontWeight: 'bold'}}>
                                {getMedal(index)}
                            </TableCell>
                            <TableCell>{row.username}</TableCell>
                            <TableCell align="right" sx={{fontWeight: 'bold'}}>{Math.round(Number(row[valueKey]))}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const LeaderboardPage: React.FC = () => {
    const [currentTab, setCurrentTab] = useState<LeaderboardType>('rating');

    const { data, isLoading, error } = useQuery({
        queryKey: ['leaderboard', currentTab],
        queryFn: () => fetchLeaderboard(currentTab),
    });

    const handleTabChange = (event: React.SyntheticEvent, newValue: LeaderboardType) => {
        setCurrentTab(newValue);
    };

    const tabsConfig = [
        { label: 'За Рейтингом', value: 'rating', key: 'rating', header: 'Рейтинг' },
        { label: 'За Перемогами', value: 'wins', key: 'wins', header: 'Перемог' },
        { label: 'За Серією Перемог', value: 'win_streak', key: 'win_streak', header: 'Стрік' },
        { label: 'За Кількістю Ігор', value: 'games_played', key: 'games_played', header: 'Ігор' },
    ];

    return (
        <Container maxWidth="lg" sx={{ py: 2 }}>
            <Typography variant="h4" sx={{ mb: 2 }}>
                Лідерборди
            </Typography>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={currentTab} onChange={handleTabChange} aria-label="leaderboard tabs">
                    {tabsConfig.map(tab => <Tab key={tab.value} label={tab.label} value={tab.value} />)}
                </Tabs>
            </Box>

            {isLoading && <Skeleton variant="rectangular" width="100%" height={400} />}
            {error && <Alert severity="error">Не вдалося завантажити лідерборд.</Alert>}
            {!isLoading && !error && (
                <LeaderboardTable 
                    data={data} 
                    valueKey={tabsConfig.find(t => t.value === currentTab)?.key as keyof LeaderboardEntry} 
                    valueHeader={tabsConfig.find(t => t.value === currentTab)?.header || ''} 
                />
            )}
        </Container>
    );
};

export default LeaderboardPage;