import { createTheme, alpha } from '@mui/material/styles';

const PRIMARY_COLOR = '#00BFA5';
const SECONDARY_COLOR = '#FFC107';
const BACKGROUND_DEFAULT = '#1A1D21';
const BACKGROUND_PAPER = '#23272F';
const TEXT_PRIMARY = '#E0E0E0';
const TEXT_SECONDARY = '#A0A0A0';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: PRIMARY_COLOR,
    },
    secondary: {
      main: SECONDARY_COLOR,
    },
    background: {
      default: BACKGROUND_DEFAULT,
      paper: BACKGROUND_PAPER,
    },
    text: {
      primary: TEXT_PRIMARY,
      secondary: TEXT_SECONDARY,
      disabled: alpha(TEXT_SECONDARY, 0.5),
    },
    divider: alpha(TEXT_SECONDARY, 0.2),
    action: {
        active: alpha(TEXT_PRIMARY, 0.54),
        hover: alpha(PRIMARY_COLOR, 0.08),
        selected: alpha(PRIMARY_COLOR, 0.16),
        disabled: alpha(TEXT_PRIMARY, 0.26),
        disabledBackground: alpha(TEXT_PRIMARY, 0.12),
        focus: alpha(PRIMARY_COLOR, 0.12),
    }
  },
  typography: {
    fontFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: {
      fontWeight: 700,
      fontSize: '1.75rem',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.35rem',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.15rem',
    },
    subtitle1: {
        fontWeight: 500,
        color: TEXT_PRIMARY,
    },
    subtitle2: {
        fontWeight: 400,
        color: TEXT_SECONDARY,
    },
    body1: {
        fontSize: '0.95rem',
    },
    caption: {
        color: TEXT_SECONDARY,
        fontSize: '0.8rem',
    }
  },
  shape: {
    borderRadius: 8, 
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: BACKGROUND_PAPER,
          boxShadow: '0px 2px 8px -1px rgba(0,0,0,0.2), 0px 4px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: BACKGROUND_PAPER,
          borderRight: `1px solid ${alpha(TEXT_SECONDARY, 0.15)}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 6,
        },
        containedPrimary: {
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
        }
      }
    },
    MuiPaper: {
        styleOverrides: {
            root: {
                backgroundImage: 'none',
            }
        }
    },
    MuiDataGrid: {
        styleOverrides: {
            root: {
                border: 'none',
                '& .MuiDataGrid-columnHeaders': {
                },
                '& .MuiDataGrid-cell': {
                    borderBottom: `1px solid ${alpha(TEXT_SECONDARY, 0.1)}`,
                },
                '& .MuiDataGrid-iconSeparator': {
                    display: 'none',
                },
            }
        }
    },
    MuiListItemButton: {
        styleOverrides: {
            root: {
                '&.Mui-selected': {
                    backgroundColor: alpha(PRIMARY_COLOR, 0.16), 
                    '&:hover': {
                        backgroundColor: alpha(PRIMARY_COLOR, 0.20),
                    },
                    '& .MuiListItemText-primary': {
                        fontWeight: '600',
                        color: PRIMARY_COLOR,
                    },
                    '& .MuiListItemIcon-root': {
                        color: PRIMARY_COLOR,
                    }
                },
            }
        }
    }
  },
});

export default theme;