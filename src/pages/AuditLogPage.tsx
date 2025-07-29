import React, { useState } from 'react';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { Container, Typography, Box, Alert, Tooltip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface AuditLogRow {
    id: number;
    timestamp: string;
    admin_id: number;
    admin_username: string;
    action_type: string;
    target_user_id?: number;
    target_username?: string;
    reason?: string;
}

interface FetchResponse {
    rows: AuditLogRow[];
    rowCount: number;
}

const fetchAuditLog = async (paginationModel: GridPaginationModel): Promise<FetchResponse> => {
    const { data } = await axios.get<FetchResponse>(`${API_BASE_URL}/api/admin/audit-log`, {
        withCredentials: true,
        params: {
            page: paginationModel.page,
            pageSize: paginationModel.pageSize,
        },
    });
    return data;
};

const AuditLogPage: React.FC = () => {
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
        page: 0,
        pageSize: 25,
    });

    const { data, isLoading, error } = useQuery({
        queryKey: ['auditLog', paginationModel],
        queryFn: () => fetchAuditLog(paginationModel),
        keepPreviousData: true,
    });

    const columns: GridColDef<AuditLogRow>[] = [
        { field: 'id', headerName: 'ID', width: 80 },
        {
            field: 'timestamp',
            headerName: 'Час',
            width: 180,
            renderCell: params => new Date(params.value).toLocaleString()
        },
        { field: 'admin_username', headerName: 'Адміністратор', width: 150 },
        { field: 'action_type', headerName: 'Дія', width: 180 },
        { field: 'target_username', headerName: 'Ціль', width: 150, renderCell: params => params.value || '—' },
        {
            field: 'reason',
            headerName: 'Деталі / Причина',
            flex: 1,
            minWidth: 250,
            renderCell: params => (
                <Tooltip title={params.value || ''}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {params.value || '—'}
                    </span>
                </Tooltip>
            )
        },
    ];

    if (error) {
        return <Container maxWidth="xl" sx={{ py: 2 }}><Alert severity="error">Не вдалося завантажити лог аудиту.</Alert></Container>;
    }

    return (
        <Container maxWidth="xl" sx={{ display: 'flex', flexDirection: 'column', height: '100%', py: 2 }}>
            <Typography variant="h4" sx={{ mb: 2, flexShrink: 0 }}>
                Лог дій адміністраторів
            </Typography>
            <Box sx={{ flexGrow: 1, width: '100%', overflow: 'hidden' }}>
                <DataGrid
                    rows={data?.rows || []}
                    columns={columns}
                    rowCount={data?.rowCount || 0}
                    loading={isLoading}
                    pageSizeOptions={[25, 50, 100]}
                    paginationModel={paginationModel}
                    onPaginationModelChange={setPaginationModel}
                    paginationMode="server"
                    sx={{ border: 'none' }}
                />
            </Box>
        </Container>
    );
};

export default AuditLogPage;