import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface Client {
    _id: string;
    name: string;
    domain: string;
}

interface ClientContextType {
    clients: Client[];
    clientsMap: Record<string, string>;
    loading: boolean;
    refreshClients: () => Promise<void>;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [clientsMap, setClientsMap] = useState<Record<string, string>>({});

    const fetchClients = async () => {
        // API call removed as per user request
        setClients([]);
        setClientsMap({});
        setLoading(false);
    };

    useEffect(() => {
        fetchClients();
    }, []);

    return (
        <ClientContext.Provider value={{ clients, clientsMap, loading, refreshClients: fetchClients }}>
            {children}
        </ClientContext.Provider>
    );
};

export const useClients = () => {
    const context = useContext(ClientContext);
    if (!context) {
        throw new Error('useClients must be used within a ClientProvider');
    }
    return context;
};
