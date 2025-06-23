  import React from 'react';
import { Routes, Route, Navigate, Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ActiveGamesPage from './pages/ActiveGamesPage';

import {
    AppBar,
    Toolbar,
    Typography,
    Button,
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
    MenuItem 
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import PeopleIcon from '@mui/icons-material/People';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import ListItemIcon from '@mui/material/ListItemIcon';
import HistoryIcon from '@mui/icons-material/History';
import GamesHistoryPage from './pages/GamesHistoryPage';

const ProtectedRoute: React.FC = () => {
  const adminUser = localStorage.getItem('adminUser');
  const navigate = useNavigate(); 

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

  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElUser(event.currentTarget);
  };

  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
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
  ];

  const drawer = (
    <Box onClick={handleDrawerToggle} sx={{ textAlign: 'center' }}>
      <Typography variant="h6" sx={{ my: 2, px: 2 }}>
        Durak Admin Panel
      </Typography>
      <List>
        {drawerItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={item.path}
              sx={(theme) => ({
                borderRadius: theme.shape.borderRadius,
                margin: theme.spacing(0.5, 1.5),
                paddingLeft: theme.spacing(2),
                '&.active': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.16),
                  '& .MuiListItemText-primary': {
                    fontWeight: '600',
                    color: theme.palette.primary.main,
                  },
                  '& .MuiListItemIcon-root': {
                    color: theme.palette.primary.main,
                  }
                },
              })}
            >
              <ListItemIcon sx={{minWidth: 'auto', mr: 1.5, justifyContent: 'center'}}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar
        component="nav"
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
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
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Durak Admin
          </Typography>
          
          <Box sx={{ flexGrow: 0 }}>
            <Tooltip title="Профіль користувача">
              <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32 }}>
                   {localStorage.getItem('adminUser') ? JSON.parse(localStorage.getItem('adminUser')!).username.substring(0,1).toUpperCase() : <AccountCircleIcon />}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              sx={{ mt: '45px' }}
              id="menu-appbar-user"
              anchorEl={anchorElUser}
              anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              keepMounted
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
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
        aria-label="admin navigation"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
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
            '& .MuiDrawer-paper': { 
                boxSizing: 'border-box', 
                width: drawerWidth, 
                borderRight: (theme) => `1px solid ${theme.palette.divider}`
            },
          }}
          open
        >
            <Toolbar />
            {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'auto',
          height: '100vh',
          paddingTop: theme => theme.spacing(8),
        }}
      >
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
            <Route path="active-games" element={<ActiveGamesPage />} />
            <Route path="/games-history" element={<GamesHistoryPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={localStorage.getItem('adminUser') ? "/" : "/login"} replace />} />
    </Routes>
  );
}

export default App;