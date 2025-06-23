import { createTheme, alpha, type PaletteMode } from '@mui/material/styles';

const palette = {
  mode: 'dark' as PaletteMode,
  primary: {
    main: '#7B61FF',
  },
  secondary: {
    main: '#4DD0E1',
  },
  error: {
    main: '#FF5252',
  },
  warning: {
    main: '#FFC107',
  },
  info: {
    main: '#29B6F6',
  },
  success: {
    main: '#66BB6A',
  },
  background: {
    default: '#121212',
    paper: '#1E1E1E',
  },
  text: {
    primary: '#E0E0E0',
    secondary: '#A0A0A0',
    disabled: alpha('#FFFFFF', 0.38),
  },
  divider: alpha('#FFFFFF', 0.12),
};

const theme = createTheme({
  palette: palette,
  typography: {
    fontFamily: '"Roboto Flex", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontSize: '2.5rem', fontWeight: 400, letterSpacing: '-0.5px' },
    h2: { fontSize: '2rem', fontWeight: 400, letterSpacing: '0px' },
    h3: { fontSize: '1.75rem', fontWeight: 500, letterSpacing: '0.15px' },
    h4: { fontSize: '1.5rem', fontWeight: 500, letterSpacing: '0.15px' },
    h5: { fontSize: '1.25rem', fontWeight: 500, letterSpacing: '0.1px' },
    h6: { fontSize: '1rem', fontWeight: 600, letterSpacing: '0.15px' },
    subtitle1: { fontSize: '1rem', fontWeight: 400, letterSpacing: '0.15px' },
    subtitle2: { fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.1px', color: palette.text.secondary },
    body1: { fontSize: '1rem', fontWeight: 400, letterSpacing: '0.5px' },
    body2: { fontSize: '0.875rem', fontWeight: 400, letterSpacing: '0.25px' },
    button: { fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'none' },
    caption: { fontSize: '0.75rem', fontWeight: 400, letterSpacing: '0.4px', color: palette.text.secondary },
    overline: { fontSize: '0.625rem', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase' },
  },
  shape: {
    borderRadius: 16,
  },
  spacing: 8,
  components: {
    MuiCssBaseline: {
        styleOverrides: `
            @import url('https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&display=swap');
            body {
            }
        `,
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 20,
          padding: '8px 22px',
        },
        containedPrimary: {
        },
        outlinedPrimary: {
            borderColor: palette.primary.main,
        }
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1), 0px 2px 2px rgba(0, 0, 0, 0.06), 0px 0px 2px rgba(0, 0, 0, 0.07)',
        },
      },
    },
    MuiPaper: {
        defaultProps: {
            elevation: 0,
        },
        styleOverrides: {
            root: {
                backgroundImage: 'none',
            },
        }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(palette.background.paper, 0.8),
          backdropFilter: 'blur(8px)',
          boxShadow: 'none',
          borderBottom: `1px solid ${palette.divider}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.background.paper,
          borderRight: 'none',
          boxShadow: '0px 8px 10px -5px rgba(0,0,0,0.05), 0px 16px 24px 2px rgba(0,0,0,0.03), 0px 6px 30px 5px rgba(0,0,0,0.04)',
        },
      },
    },
    MuiTextField: {
        defaultProps: {
            variant: 'filled',
        },
        styleOverrides: {
            root: {
                '& .MuiFilledInput-root': {
                    backgroundColor: alpha(palette.text.primary, 0.06),
                    borderRadius: 8,
                    '&:hover': {
                        backgroundColor: alpha(palette.text.primary, 0.09),
                    },
                    '&.Mui-focused': {
                        backgroundColor: alpha(palette.text.primary, 0.12),
                    },
                    '&::before, &::after': {
                        display: 'none',
                    },
                },
                '& .MuiOutlinedInput-root': {
                    borderRadius: 8,
                }
            }
        }
    },
    MuiDataGrid: {
        styleOverrides: {
            root: {
                border: 'none',
                borderRadius: 12,
                backgroundColor: palette.background.paper, 
                '& .MuiDataGrid-columnHeaders': {
                    borderBottom: `1px solid ${palette.divider}`,
                },
                '& .MuiDataGrid-cell': {
                    borderBottom: `1px solid ${palette.divider}`,
                },
                '& .MuiDataGrid-iconSeparator': {
                    display: 'none',
                },
                '& .MuiDataGrid-footerContainer': {
                    borderTop: `1px solid ${palette.divider}`,
                }
            }
        }
    },
    MuiListItemButton: {
        styleOverrides: {
            root: {
                borderRadius: 8,
                margin: '4px 8px',
                '&.Mui-selected': {
                    backgroundColor: alpha(palette.primary.main, 0.16),
                    '&:hover': {
                        backgroundColor: alpha(palette.primary.main, 0.20),
                    },
                    '& .MuiListItemText-primary': {
                        fontWeight: '600',
                        color: palette.primary.main,
                    },
                    '& .MuiListItemIcon-root': {
                        color: palette.primary.main,
                    }
                },
            }
        }
    },
    MuiChip: {
        styleOverrides: {
            root: {
                borderRadius: 6,
                fontWeight: '600',
                padding: '2px 4px',
                height: 'auto',
            }
        }
    }
  },
});

export default theme;