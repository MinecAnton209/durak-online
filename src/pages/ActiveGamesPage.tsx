import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { DataGrid, type GridColDef, type GridRenderCellParams, GridActionsCellItem } from '@mui/x-data-grid';
import { Container, Typography, Box, Alert, IconButton, Tooltip, Chip, Skeleton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import StopCircleIcon from '@mui/icons-material/StopCircle';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const GAME_CLIENT_URL = import.meta.env.VITE_GAME_CLIENT_URL;

interface PlayerInfo {
    id: string;
    dbId?: number;
    name: string;
    isGuest: boolean;
}

interface GameSettings {
    deckSize: number;
    maxPlayers?: number;
}

interface ActiveGame {
    id: string;
    status: 'in_progress' | 'lobby';
    playerCount: number;
    maxPlayers: number;
    players: PlayerInfo[];
    hostId: string;
    hostName: string;
    startTime?: string;
    settings: GameSettings;
}

const ActiveGamesPage: React.FC = () => {
    const [games, setGames] = useState<ActiveGame[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchActiveGames = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get<ActiveGame[]>(`${API_BASE_URL}/api/admin/games/active`, {
                withCredentials: true,
            });
            setGames(response.data);
        } catch (err: any) {
            if (axios.isAxiosError(err) && err.response) {
                setError(err.response.data.message || err.response.data.error || 'Помилка завантаження активних ігор.');
            } else {
                setError('Не вдалося підключитися до сервера.');
            }
            console.error('Fetch active games error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchActiveGames();
    }, [fetchActiveGames]);

    const handleSpectateGame = (gameId: string) => {
        const spectateUrl = `${GAME_CLIENT_URL}/?spectateGameId=${gameId}&adminSpectator=true`;
        window.open(spectateUrl, '_blank');
    };

    const handleTerminateGame = async (gameId: string, gameHost: string) => {
        const reason = prompt(`Вкажіть причину примусового завершення гри ${gameId} (хост: ${gameHost}):`);
        if (reason === null) return;

        if (reason.trim() === '' && !confirm("Причина не вказана. Завершити гру без причини?")) {
            return;
        }
        setLoading(true);
        try {
            await axios.post(`${API_BASE_URL}/api/admin/games/${gameId}/end`,
                { reason: reason.trim() || undefined },
                { withCredentials: true }
            );
            alert(`Гра ${gameId} була успішно завершена.`);
            fetchActiveGames();
        } catch (err) {
            alert(`Помилка завершення гри ${gameId}.`);
            console.error('Terminate game error:', err);
        } finally {
            setLoading(false);
        }
    };

    const columns: GridColDef<ActiveGame>[] = [
        { field: 'id', headerName: 'ID Гри', width: 130, sortable: true },
        {
            field: 'status',
            headerName: 'Статус',
            width: 120,
            sortable: true,
            renderCell: (params: GridRenderCellParams<ActiveGame, ActiveGame['status']>) => (
                <Chip
                    label={params.value === 'in_progress' ? 'В грі' : (params.value === 'lobby' ? 'Лобі' : 'Невідомо')}
                    color={params.value === 'in_progress' ? 'success' : (params.value === 'lobby' ? 'warning' : 'default')}
                    size="small"
                />
            ),
        },
        {
            field: 'playerCount',
            headerName: 'Гравці',
            width: 100,
            sortable: true,
            renderCell: (params: GridRenderCellParams<ActiveGame, number>) => (
                `${params.value ?? 0}/${params.row.maxPlayers ?? 'N/A'}`
            ),
        },
        {
            field: 'hostName',
            headerName: 'Хост',
            flex: 1,
            minWidth: 150,
            sortable: true,
            renderCell: (params: GridRenderCellParams<ActiveGame, string>) => (
                <Tooltip title={`ID сокета хоста: ${params.row.hostId}`}>
                    <span>{params.value}</span>
                </Tooltip>
            )
        },
        {
            field: 'players',
            headerName: 'Учасники',
            flex: 1,
            minWidth: 200,
            sortable: false,
            renderCell: (params: GridRenderCellParams<ActiveGame, PlayerInfo[]>) => (
                <Tooltip title={params.value?.map((p: PlayerInfo) => p.name).join(', ') || ''}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {params.value?.map((p: PlayerInfo) => p.name).join(', ') || '-'}
                    </span>
                </Tooltip>
            ),
        },
        {
            field: 'startTime',
            headerName: 'Час початку',
            width: 180,
            sortable: true,
            renderCell: (params: GridRenderCellParams<ActiveGame, string | undefined>) => (
                params.value ? new Date(params.value).toLocaleString() : '-'
            )
        },
        {
            field: 'settings',
            headerName: 'Налаштування',
            width: 130,
            sortable: false,
            renderCell: (params: GridRenderCellParams<ActiveGame, GameSettings>) => (
                `Колода: ${params.value?.deckSize ?? 'N/A'}`
            ),
        },
        {
            field: 'actions',
            type: 'actions',
            headerName: 'Дії',
            width: 100,
            cellClassName: 'actions',
            getActions: ({ id, row }) => {
                return [
                    <GridActionsCellItem
                        key={`spectate-${id}`}
                        icon={<Tooltip title="Спостерігати"><VisibilityIcon /></Tooltip>}
                        label="Спостерігати"
                        onClick={() => handleSpectateGame(id as string)}
                    />,
                    <GridActionsCellItem
                        key={`terminate-${id}`}
                        icon={<Tooltip title="Завершити гру"><StopCircleIcon sx={{ color: (theme) => theme.palette.error.main }} /></Tooltip>}
                        label="Завершити"
                        onClick={() => handleTerminateGame(id as string, row.hostName)}
                        disabled={loading}
                    />,
                ];
            },
        },
    ];

    if (loading && games.length === 0) {
        return (
            <Container maxWidth="xl" sx={{ py: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexShrink: 0 }}>
                    <Skeleton variant="text" width={250} height={40} />
                    <Skeleton variant="circular" width={40} height={40} />
                </Box>
                <Box sx={{ flexGrow: 1, width: '100%' }}>
                    <Skeleton variant="rectangular" width="100%" height="100%" sx={{ borderRadius: '12px' }} />
                </Box>
            </Container>
        );
    }

    if (error) {
        return <Container maxWidth="xl" sx={{ py: 2 }}><Alert severity="error" sx={{ mt: 2 }}>{error}</Alert></Container>;
    }

    return (
        <Container maxWidth="xl" sx={{ display: 'flex', flexDirection: 'column', height: '100%', py: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexShrink: 0 }}>
                <Typography variant="h4">
                    Активні Ігри
                </Typography>
                <Tooltip title="Оновити список">
                    <span>
                        <IconButton onClick={fetchActiveGames} disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>
            <Box sx={{ flexGrow: 1, width: '100%', overflow: 'hidden' }}>
                <DataGrid
                    rows={games}
                    columns={columns}
                    pageSizeOptions={[10, 25, 50, 100]}
                    initialState={{
                        pagination: {
                            paginationModel: { pageSize: 25, page: 0 },
                        },
                    }}
                    loading={loading}
                    density="standard"
                    sx={{ border: 'none' }}
                />
            </Box>
        </Container>
    );
};

export default ActiveGamesPage;