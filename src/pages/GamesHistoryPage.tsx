import React, { useState } from 'react';
import { DataGrid, type GridColDef, type GridRenderCellParams, type GridPaginationModel } from '@mui/x-data-grid';
import { Container, Typography, Box, Alert } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link as RouterLink } from 'react-router-dom';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface GameHistoryRow {
    id: string;
    game_type: string;
    duration_seconds: number;
    end_time: string;
    winner_username?: string;
    loser_username?: string;
}

interface FetchResponse {
    rows: GameHistoryRow[];
    rowCount: number;
}

const fetchGamesHistory = async (paginationModel: GridPaginationModel): Promise<FetchResponse> => {
    const { data } = await axios.get<FetchResponse>(`${API_BASE_URL}/api/admin/games/history`, {
        withCredentials: true,
        params: {
            page: paginationModel.page,
            pageSize: paginationModel.pageSize,
        },
    });
    return data;
};

const GamesHistoryPage: React.FC = () => {
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
        page: 0,
        pageSize: 25,
    });

    const { data, isLoading, error } = useQuery({
        queryKey: ['gamesHistory', paginationModel],
        queryFn: () => fetchGamesHistory(paginationModel),
        placeholderData: (previousData) => previousData,
    });

    const columns: GridColDef<GameHistoryRow>[] = [
        {
            field: 'id',
            headerName: 'ID Гри',
            width: 150,
            renderCell: (params: GridRenderCellParams<GameHistoryRow>) => (
                <RouterLink to={`/games-history/${params.value}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {params.value}
                </RouterLink>
            )
        },
        { field: 'game_type', headerName: 'Тип гри', width: 130 },
        { field: 'winner_username', headerName: 'Переможець', flex: 1, minWidth: 150, renderCell: (params) => params.value || '-' },
        { field: 'loser_username', headerName: 'Програвший', flex: 1, minWidth: 150, renderCell: (params) => params.value || '-' },
        { field: 'duration_seconds', headerName: 'Тривалість (сек)', type: 'number', width: 150 },
        {
            field: 'end_time',
            headerName: 'Час завершення',
            width: 200,
            renderCell: (params: GridRenderCellParams<any, string>) => (
                params.value ? new Date(params.value).toLocaleString() : '-'
            ),
        },
    ];

    if (error) {
        return <Container maxWidth="xl" sx={{ py: 2 }}><Alert severity="error">Не вдалося завантажити історію ігор.</Alert></Container>;
    }

    return (
        <Container maxWidth="xl" sx={{ display: 'flex', flexDirection: 'column', height: '100%', py: 2 }}>
            <Typography variant="h4" sx={{ mb: 2, flexShrink: 0 }}>
                Історія Ігор
            </Typography>
            <Box sx={{ flexGrow: 1, width: '100%', overflow: 'hidden' }}>
                <DataGrid
                    rows={(data as FetchResponse)?.rows || []}
                    columns={columns}
                    rowCount={(data as FetchResponse)?.rowCount || 0}
                    loading={isLoading}
                    pageSizeOptions={[10, 25, 50, 100]}
                    paginationModel={paginationModel}
                    onPaginationModelChange={setPaginationModel}
                    paginationMode="server"
                    sx={{ border: 'none' }}
                />
            </Box>
        </Container>
    );
};

export default GamesHistoryPage;