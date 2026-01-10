import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Get auth headers
const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('crmToken')}`
});

/**
 * Hook to fetch leads with React Query caching
 */
export function useLeads({ page = 1, pageSize = 200, filters = {}, sort = 'created_at', order = 'desc' }) {
  return useQuery({
    queryKey: ['leads', { page, pageSize, filters, sort, order }],
    queryFn: async () => {
      const offset = (page - 1) * pageSize;
      const params = {
        limit: pageSize,
        offset,
        sort,
        order,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      };
      
      const response = await axios.get(`${API}/crm/leads`, {
        headers: getAuthHeaders(),
        params
      });
      
      // Handle both array and paginated format
      if (Array.isArray(response.data)) {
        return { data: response.data, total: response.data.length, limit: pageSize, offset };
      }
      return response.data;
    },
    keepPreviousData: true, // Keep showing previous data while fetching new page
    staleTime: 60 * 1000, // 60 seconds
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to fetch users (cached globally)
 */
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await axios.get(`${API}/crm/users`, {
        headers: getAuthHeaders()
      });
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - users don't change often
    cacheTime: 60 * 60 * 1000, // 1 hour
  });
}

/**
 * Hook to fetch teams (cached globally)
 */
export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await axios.get(`${API}/crm/teams`, {
        headers: getAuthHeaders()
      });
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
  });
}

/**
 * Hook to fetch statuses (cached globally)
 */
export function useStatuses() {
  return useQuery({
    queryKey: ['statuses'],
    queryFn: async () => {
      const response = await axios.get(`${API}/crm/statuses`, {
        headers: getAuthHeaders()
      });
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
  });
}

/**
 * Hook to prefetch next page
 */
export function usePrefetchLeads() {
  const queryClient = useQueryClient();
  
  return ({ page, pageSize, filters, sort, order }) => {
    const nextPage = page + 1;
    queryClient.prefetchQuery({
      queryKey: ['leads', { page: nextPage, pageSize, filters, sort, order }],
      queryFn: async () => {
        const offset = (nextPage - 1) * pageSize;
        const params = {
          limit: pageSize,
          offset,
          sort,
          order,
          ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
        };
        
        const response = await axios.get(`${API}/crm/leads`, {
          headers: getAuthHeaders(),
          params
        });
        
        if (Array.isArray(response.data)) {
          return { data: response.data, total: response.data.length, limit: pageSize, offset };
        }
        return response.data;
      },
    });
  };
}

/**
 * Mutation hook for updating lead with optimistic updates
 */
export function useUpdateLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ leadId, updates }) => {
      const response = await axios.put(`${API}/crm/leads/${leadId}`, updates, {
        headers: getAuthHeaders()
      });
      return response.data;
    },
    onMutate: async ({ leadId, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      
      // Snapshot previous values
      const previousLeads = queryClient.getQueriesData({ queryKey: ['leads'] });
      
      // Optimistically update cache
      queryClient.setQueriesData({ queryKey: ['leads'] }, (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map(lead => 
            lead.id === leadId ? { ...lead, ...updates } : lead
          )
        };
      });
      
      return { previousLeads };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousLeads) {
        context.previousLeads.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
