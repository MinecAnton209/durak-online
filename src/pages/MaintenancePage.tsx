import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Container, Typography, Box, Alert, Skeleton, Paper, TextField, Button, CircularProgress, Chip, Divider, Grid } from '@mui/material';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface MaintenanceStatus {
    enabled: boolean;
    message: string;
    startTime: number | null;
}

const fetchMaintenanceStatus = async (): Promise<MaintenanceStatus> => {
    const { data } = await axios.get(`${API_BASE_URL}/api/admin/maintenance/status`, { withCredentials: true });
    return data;
};

const MaintenancePage: React.FC = () => {
    const queryClient = useQueryClient();
    const [message, setMessage] = useState('');
    const [minutesUntilStart, setMinutesUntilStart] = useState(15);
    const [durationMinutes, setDurationMinutes] = useState(60);

    const { data: status, isLoading, error } = useQuery({
        queryKey: ['maintenanceStatus'],
        queryFn: fetchMaintenanceStatus,
        onSuccess: (data) => {
            if (data.message && !data.enabled) {
                setMessage(data.message);
            }
        }
    });

    const mutationOptions = {
        onSuccess: () => {
            alert('Статус оновлено!');
            queryClient.invalidateQueries({ queryKey: ['maintenanceStatus'] });
        },
        onError: (err: any) => {
            alert(`Помилка: ${err.response?.data?.error || err.message}`);
        },
    };

    const enableMutation = useMutation({
        mutationFn: (variables: { message: string; minutesUntilStart: number, durationMinutes: number }) =>
            axios.post(`${API_BASE_URL}/api/admin/maintenance/enable`, variables, { withCredentials: true }),
        ...mutationOptions
    });

    const disableMutation = useMutation({
        mutationFn: () => axios.post(`${API_BASE_URL}/api/admin/maintenance/disable`, {}, { withCredentials: true }),
        ...mutationOptions
    });

    const handleEnable = () => {
        enableMutation.mutate({ message, minutesUntilStart, durationMinutes });
    };

    const handleDisable = () => {
        disableMutation.mutate();
    };

    if (isLoading) {
        return <Container maxWidth="md" sx={{ py: 2 }}><Skeleton variant="rectangular" height={300} /></Container>;
    }

    if (error) {
        return <Container maxWidth="md" sx={{ py: 2 }}><Alert severity="error">{(error as any).message}</Alert></Container>;
    }

    return (
        <Container maxWidth="md" sx={{ py: 2 }}>
            <Typography variant="h4" sx={{ mb: 2 }}>
                Режим Технічних Робіт
            </Typography>
            <Paper sx={{ p: 3, borderRadius: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ mr: 2 }}>
                        Поточний статус:
                    </Typography>
                    <Chip label={status?.enabled ? "УВІМКНЕНО" : (status?.startTime ? "ЗАПЛАНОВАНО" : "ВИМКНЕНО")} color={status?.enabled ? "error" : (status?.startTime ? "warning" : "success")} />
                </Box>

                {status?.startTime && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Технічні роботи заплановано на: {new Date(status.startTime).toLocaleString()}.
                        Повідомлення для гравців: "{status.message}"
                    </Alert>
                )}

                {status?.enabled && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        Сайт наразі в режимі технічних робіт! Повідомлення: "{status.message}"
                    </Alert>
                )}

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>Керування</Typography>
                <Box component="form" noValidate autoComplete="off">
                    <TextField
                        label="Повідомлення для гравців"
                        fullWidth
                        multiline
                        rows={3}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        sx={{ mb: 2 }}
                        placeholder="Наприклад: Оновлюємо сервери до версії 2.0! Повернемося за годину."
                    />
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={6}>
                            <TextField
                                label="Почати через (хв)"
                                type="number"
                                value={minutesUntilStart}
                                onChange={(e) => setMinutesUntilStart(Number(e.target.value))}
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Тривалість (хв)"
                                type="number"
                                value={durationMinutes}
                                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                                fullWidth
                            />
                        </Grid>
                    </Grid>
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                        <Button
                            variant="contained"
                            color="warning"
                            onClick={handleEnable}
                            disabled={enableMutation.isLoading || disableMutation.isLoading}
                        >
                            {enableMutation.isLoading ? <CircularProgress size={24} /> : "Запланувати / Увімкнути"}
                        </Button>
                        <Button
                            variant="contained"
                            color="success"
                            onClick={handleDisable}
                            disabled={disableMutation.isLoading || (!status?.enabled && !status?.startTime)}
                        >
                            {disableMutation.isLoading ? <CircularProgress size={24} /> : "Вимкнути / Скасувати"}
                        </Button>
                    </Box>
                </Box>
            </Paper>
        </Container>
    );
};

export default MaintenancePage;