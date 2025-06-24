import React from 'react';
import { Routes, Route, Navigate, Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ActiveGamesPage from './pages/ActiveGamesPage';
import GamesHistoryPage from './pages/GamesHistoryPage';
import LeaderboardPage from './pages/LeaderboardPage';
import UserDetailPage from './pages/UserDetailPage';

import {
    AppBar,
    Toolbar,
    Typography,
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Drawer,
    IconButton,
    Tooltip,
    Avatar,
    Menu,
    MenuItem,
    CssBaseline,
    ListItemIcon,
    alpha
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import PeopleIcon from '@mui/icons-material/People';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import HistoryIcon from '@mui/icons-material/History';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';

const ProtectedRoute: React.FC = () => {
    const adminUser = localStorage.getItem('adminUser');

    if (!adminUser) {
        return <Navigate to="/login" replace />;
    }
    try {
        const parsedUser = JSON.parse(adminUser);
        if (!parsedUser.is_admin) {
            localStorage.removeItem('adminUser');
            return <Navigate to="/login" replace />;
        }
    } catch (e) {
        localStorage.removeItem('adminUser');
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};

const drawerWidth = 240;

const AdminLayout: React.FC = () => {
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const navigate = useNavigate();
    const [anchorElUser, setAnchorElUser] = React.useState<null | HTMLElement>(null);

    const handleDrawerToggle = () => {
        setMobileOpen(prevState => !prevState);
    };

    const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorElUser(event.currentTarget);
    };

    const handleCloseUserMenu = () => {
        setAnchorElUser(null);
    };

    const handleLogout = () => {
        handleCloseUserMenu();
        localStorage.removeItem('adminUser');
        navigate('/login', { replace: true });
    };

    const drawerItems = [
        { text: 'Головна', path: '/', icon: <HomeIcon /> },
        { text: 'Користувачі', path: '/users', icon: <PeopleIcon /> },
        { text: 'Активні Ігри', path: '/active-games', icon: <SportsEsportsIcon /> },
        { text: 'Історія Ігор', path: '/games-history', icon: <HistoryIcon /> },
        { text: 'Лідерборди', path: '/leaderboards', icon: <LeaderboardIcon /> },
    ];

    const drawer = (
        <div>
            <Toolbar />
            <List>
                {drawerItems.map((item) => (
                    <ListItem key={item.text} disablePadding>
                        <ListItemButton
                            component={RouterLink}
                            to={item.path}
                            sx={{
                                margin: '4px 8px',
                                borderRadius: 2,
                                '&.active': {
                                    backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.16),
                                    '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                                        color: 'primary.main',
                                        fontWeight: '600'
                                    },
                                },
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 'auto', mr: 2, justifyContent: 'center' }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </div>
    );

    return (
        <Box sx={{ display: 'flex' }}>
            <CssBaseline />
            <AppBar
                position="fixed"
                sx={{
                    width: { sm: `calc(100% - ${drawerWidth}px)` },
                    ml: { sm: `${drawerWidth}px` },
                }}
            >
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        edge="start"
                        onClick={handleDrawerToggle}
                        sx={{ mr: 2, display: { sm: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
                        Durak Admin
                    </Typography>
                    <Box sx={{ flexGrow: 0 }}>
                        <Tooltip title="Профіль">
                            <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                                <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32 }}>
                                    {localStorage.getItem('adminUser') ? JSON.parse(localStorage.getItem('adminUser')!).username.substring(0, 1).toUpperCase() : <AccountCircleIcon />}
                                </Avatar>
                            </IconButton>
                        </Tooltip>
                        <Menu
                            sx={{ mt: '45px' }}
                            anchorEl={anchorElUser}
                            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                            keepMounted
                            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            open={Boolean(anchorElUser)}
                            onClose={handleCloseUserMenu}
                        >
                            <MenuItem onClick={handleLogout}>
                                <ListItemIcon>
                                    <LogoutIcon fontSize="small" />
                                </ListItemIcon>
                                <Typography textAlign="center">Вийти</Typography>
                            </MenuItem>
                        </Menu>
                    </Box>
                </Toolbar>
            </AppBar>
            <Box
                component="nav"
                sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
            >
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        display: { xs: 'block', sm: 'none' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
                    }}
                >
                    {drawer}
                </Drawer>
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', sm: 'block' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
                    }}
                    open
                >
                    {drawer}
                </Drawer>
            </Box>
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 3,
                    width: { sm: `calc(100% - ${drawerWidth}px)` },
                }}
            >
                <Toolbar />
                <Outlet />
            </Box>
        </Box>
    );
};


function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
                <Route element={<AdminLayout />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="users/:userId" element={<UserDetailPage />} />
                    <Route path="active-games" element={<ActiveGamesPage />} />
                    <Route path="games-history" element={<GamesHistoryPage />} />
                    <Route path="leaderboards" element={<LeaderboardPage />} />
                </Route>
            </Route>
            <Route path="*" element={<Navigate to={localStorage.getItem('adminUser') ? "/" : "/login"} replace />} />
        </Routes>
    );
}

export default App;