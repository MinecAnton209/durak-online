import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { DataGrid, type GridColDef, type GridRenderCellParams, GridActionsCellItem } from '@mui/x-data-grid';
import { Container, Typography, Box, Alert, IconButton, Tooltip, Chip, Skeleton } from '@mui/material';
import { Block } from '@mui/icons-material';
import LockOpen from '@mui/icons-material/LockOpen';
import ChatBubbleOutline from '@mui/icons-material/ChatBubbleOutline';
import VolumeOff from '@mui/icons-material/VolumeOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Link as RouterLink } from 'react-router-dom';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface User {
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

const UsersPage: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            type RawUser = Omit<User, 'is_verified' | 'is_admin' | 'is_banned' | 'is_muted'> & {
                is_verified: 0 | 1;
                is_admin: 0 | 1;
                is_banned: 0 | 1;
                is_muted: 0 | 1;
            };

            const response = await axios.get<RawUser[]>(`${API_BASE_URL}/api/admin/users`, {
                withCredentials: true,
            });

            const normalizedUsers: User[] = response.data.map(user => ({
                ...user,
                is_verified: !!user.is_verified,
                is_admin: !!user.is_admin,
                is_banned: !!user.is_banned,
                is_muted: !!user.is_muted,
            }));

            setUsers(normalizedUsers);
        } catch (err: any) {
            if (axios.isAxiosError(err) && err.response) {
                setError(err.response.data.message || err.response.data.error || 'Помилка завантаження користувачів.');
            } else {
                setError('Не вдалося підключитися до сервера.');
            }
            console.error('Fetch users error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleBanToggle = async (userId: number, currentBanStatus: boolean, username: string) => {
        const action = currentBanStatus ? 'unban' : 'ban';
        let reason = '';
        if (!currentBanStatus) {
            reason = prompt(`Вкажіть причину бану для користувача ${username}:`) || '';
            if (reason.trim() === '' && !confirm("Причина бану не вказана. Продовжити без причини?")) {
                return;
            }
        }

        setLoading(true);
        try {
            await axios.post(`${API_BASE_URL}/api/admin/users/${userId}/${action}`,
                !currentBanStatus ? { reason: reason.trim() || undefined } : {},
                { withCredentials: true }
            );
            fetchUsers();
            alert(`Користувача ${username} було ${currentBanStatus ? 'розбанено' : 'забанено'}.`);
        } catch (err) {
            alert(`Помилка ${action} користувача.`);
            console.error(`${action} user error:`, err);
        } finally {
            setLoading(false);
        }
    };

    const handleMuteToggle = async (userId: number, currentMuteStatus: boolean, username: string) => {
        const action = currentMuteStatus ? 'unmute' : 'mute';
        setLoading(true);
        try {
            await axios.post(`${API_BASE_URL}/api/admin/users/${userId}/${action}`, {}, { withCredentials: true });
            fetchUsers();
            alert(`Чат користувача ${username} було ${currentMuteStatus ? 'розмучено' : 'замучено'}.`);
        } catch (err) {
            alert(`Помилка ${action} чату користувача.`);
            console.error(`${action} chat error:`, err);
        } finally {
            setLoading(false);
        }
    };


    const columns: GridColDef<User>[] = [
        { field: 'id', headerName: 'ID', width: 70 },
        { 
            field: 'username', 
            headerName: 'Ім\'я користувача', 
            flex: 1, 
            minWidth: 180,
            renderCell: (params: GridRenderCellParams<User>) => (
                <RouterLink to={`/users/${params.row.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {params.value}
                </RouterLink>
            )
        },
        { field: 'wins', headerName: 'Перемог', type: 'number', width: 100 },
        { field: 'losses', headerName: 'Поразок', type: 'number', width: 100 },
        { field: 'streak_count', headerName: 'Стрік', type: 'number', width: 90 },
        { 
            field: 'is_verified', 
            headerName: 'Верифікований', 
            type: 'boolean', 
            width: 130,
            renderCell: (params: GridRenderCellParams<User, boolean>) => (
                params.value ? <CheckIcon color="success" /> : <CloseIcon color="disabled" />
            )
        },
        { 
            field: 'is_admin', 
            headerName: 'Адмін', 
            type: 'boolean', 
            width: 100,
            renderCell: (params: GridRenderCellParams<User, boolean>) => (
                params.value ? <CheckIcon color="primary" /> : <CloseIcon color="disabled" />
            )
        },
        {
            field: 'is_banned', 
            headerName: 'Забанений', 
            type: 'boolean', 
            width: 120,
            renderCell: (params: GridRenderCellParams<User, boolean>) => (
                 <Chip label={params.value ? 'Так' : 'Ні'} color={params.value ? 'error' : 'default'} size="small" variant={params.value ? 'filled' : 'outlined'} />
            )
        },
        {
            field: 'ban_reason', 
            headerName: 'Причина бану', 
            flex: 1, 
            minWidth: 150,
            renderCell: (params) => params.value || '—'
        },
        {
            field: 'is_muted', 
            headerName: 'Мут чату', 
            type: 'boolean', 
            width: 120,
            renderCell: (params: GridRenderCellParams<User, boolean>) => (
                 <Chip label={params.value ? 'Так' : 'Ні'} color={params.value ? 'warning' : 'default'} size="small" variant={params.value ? 'filled' : 'outlined'} />
            )
        },
        {
            field: 'actions',
            type: 'actions',
            headerName: 'Дії',
            width: 130,
            getActions: ({ row }) => {
                return [
                    <GridActionsCellItem
                        key={`ban-${row.id}`}
                        icon={<Tooltip title={row.is_banned ? "Розбанити" : "Забанити"}>{row.is_banned ? <LockOpen /> : <Block />}</Tooltip>}
                        label={row.is_banned ? "Розбанити" : "Забанити"}
                        onClick={() => handleBanToggle(row.id, row.is_banned, row.username)}
                        sx={{ color: row.is_banned ? 'success.main' : 'error.main' }}
                        disabled={loading}
                    />,
                    <GridActionsCellItem
                        key={`mute-${row.id}`}
                        icon={<Tooltip title={row.is_muted ? "Зняти мут" : "Приглушити чат"}>{row.is_muted ? <ChatBubbleOutline /> : <VolumeOff />}</Tooltip>}
                        label={row.is_muted ? "Зняти мут" : "Приглушити чат"}
                        onClick={() => handleMuteToggle(row.id, row.is_muted, row.username)}
                        sx={{ color: row.is_muted ? 'success.main' : 'warning.main' }}
                        disabled={loading}
                    />,
                ];
            },
        },
    ];

    if (loading && users.length === 0) {
        return (
            <Container maxWidth="xl" sx={{ py: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexShrink: 0 }}>
                    <Skeleton variant="text" width={250} height={40} />
                    <Skeleton variant="circular" width={40} height={40} />
                </Box>
                <Box sx={{ flexGrow: 1, width: '100%' }}>
                    <Skeleton variant="rectangular" width="100%" height="100%" sx={{ borderRadius: '12px' }}/>
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
                    Управління користувачами
                </Typography>
                <Tooltip title="Оновити список">
                     <span>
                        <IconButton onClick={fetchUsers} disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>
            <Box sx={{ flexGrow: 1, width: '100%', overflow: 'hidden' }}>
                <DataGrid
                    rows={users}
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

export default UsersPage;