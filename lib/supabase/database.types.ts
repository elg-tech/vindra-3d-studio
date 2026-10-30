export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      cost_sheet_filaments: {
        Row: {
          color_hex: string | null
          cost_sheet_id: string
          created_at: string
          filament_id: string | null
          grams: number
          id: string
          material: string
          owner_id: string
          sort_order: number
          spool_removed: boolean
          updated_at: string
        }
        Insert: {
          color_hex?: string | null
          cost_sheet_id: string
          created_at?: string
          filament_id?: string | null
          grams: number
          id?: string
          material: string
          owner_id?: string
          sort_order?: number
          spool_removed?: boolean
          updated_at?: string
        }
        Update: {
          color_hex?: string | null
          cost_sheet_id?: string
          created_at?: string
          filament_id?: string | null
          grams?: number
          id?: string
          material?: string
          owner_id?: string
          sort_order?: number
          spool_removed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_sheet_filaments_cost_sheet_id_fkey"
            columns: ["cost_sheet_id"]
            isOneToOne: false
            referencedRelation: "cost_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_sheet_filaments_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_sheet_supplies: {
        Row: {
          cost_sheet_id: string
          created_at: string
          id: string
          name: string
          owner_id: string
          quantity: number
          supply_id: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          cost_sheet_id: string
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          quantity?: number
          supply_id?: string | null
          unit_cost: number
          updated_at?: string
        }
        Update: {
          cost_sheet_id?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          quantity?: number
          supply_id?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_sheet_supplies_cost_sheet_id_fkey"
            columns: ["cost_sheet_id"]
            isOneToOne: false
            referencedRelation: "cost_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_sheet_supplies_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_sheets: {
        Row: {
          calculated_at: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          packaging_cost: number
          pieces_per_plate: number
          post_minutes: number
          prep_minutes: number
          print_minutes: number
          printer_id: string | null
          purge_g: number
          quantity: number
          source_file_path: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          calculated_at?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id?: string
          packaging_cost?: number
          pieces_per_plate?: number
          post_minutes?: number
          prep_minutes?: number
          print_minutes?: number
          printer_id?: string | null
          purge_g?: number
          quantity?: number
          source_file_path?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          calculated_at?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          packaging_cost?: number
          pieces_per_plate?: number
          post_minutes?: number
          prep_minutes?: number
          print_minutes?: number
          printer_id?: string | null
          purge_g?: number
          quantity?: number
          source_file_path?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_sheets_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          id: string
          instagram: string | null
          name: string
          notes: string | null
          owner_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          name: string
          notes?: string | null
          owner_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          name?: string
          notes?: string | null
          owner_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      document_counters: {
        Row: {
          kind: string
          last_value: number
          owner_id: string
          year: number
        }
        Insert: {
          kind: string
          last_value?: number
          owner_id: string
          year: number
        }
        Update: {
          kind?: string
          last_value?: number
          owner_id?: string
          year?: number
        }
        Relationships: []
      }
      filament_brands: {
        Row: {
          created_at: string
          empty_spool_weight_g: number | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empty_spool_weight_g?: number | null
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empty_spool_weight_g?: number | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      filament_movements: {
        Row: {
          created_at: string
          filament_id: string
          grams: number
          id: string
          kind: string
          notes: string | null
          occurred_at: string
          order_id: string | null
          owner_id: string
          print_failure_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          filament_id: string
          grams: number
          id?: string
          kind: string
          notes?: string | null
          occurred_at?: string
          order_id?: string | null
          owner_id?: string
          print_failure_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          filament_id?: string
          grams?: number
          id?: string
          kind?: string
          notes?: string | null
          occurred_at?: string
          order_id?: string | null
          owner_id?: string
          print_failure_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filament_movements_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filament_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filament_movements_print_failure_id_fkey"
            columns: ["print_failure_id"]
            isOneToOne: false
            referencedRelation: "print_failures"
            referencedColumns: ["id"]
          },
        ]
      }
      filaments: {
        Row: {
          brand_id: string | null
          color_hex: string
          color_name: string
          cost_per_gram: number | null
          created_at: string
          diameter_mm: number
          id: string
          material: string
          min_stock_g: number
          net_weight_g: number
          notes: string | null
          owner_id: string
          price_paid: number
          purchased_at: string | null
          remaining_g: number
          shipping_cost: number
          status: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          color_hex?: string
          color_name: string
          cost_per_gram?: number | null
          created_at?: string
          diameter_mm?: number
          id?: string
          material: string
          min_stock_g?: number
          net_weight_g: number
          notes?: string | null
          owner_id?: string
          price_paid: number
          purchased_at?: string | null
          remaining_g?: number
          shipping_cost?: number
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          color_hex?: string
          color_name?: string
          cost_per_gram?: number | null
          created_at?: string
          diameter_mm?: number
          id?: string
          material?: string
          min_stock_g?: number
          net_weight_g?: number
          notes?: string | null
          owner_id?: string
          price_paid?: number
          purchased_at?: string | null
          remaining_g?: number
          shipping_cost?: number
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filaments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "filament_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cost_input: Json | null
          cost_sheet_id: string | null
          cost_source: string | null
          created_at: string
          description: string
          id: string
          order_id: string
          owner_id: string
          print_minutes: number | null
          quantity: number
          unit_cost: number | null
          unit_labor_cost: number | null
          unit_price: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          cost_input?: Json | null
          cost_sheet_id?: string | null
          cost_source?: string | null
          created_at?: string
          description: string
          id?: string
          order_id: string
          owner_id?: string
          print_minutes?: number | null
          quantity?: number
          unit_cost?: number | null
          unit_labor_cost?: number | null
          unit_price: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          cost_input?: Json | null
          cost_sheet_id?: string | null
          cost_source?: string | null
          created_at?: string
          description?: string
          id?: string
          order_id?: string
          owner_id?: string
          print_minutes?: number | null
          quantity?: number
          unit_cost?: number | null
          unit_labor_cost?: number | null
          unit_price?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_cost_sheet_id_fkey"
            columns: ["cost_sheet_id"]
            isOneToOne: false
            referencedRelation: "cost_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          created_at: string
          fee_amount: number | null
          id: string
          kind: string
          method: string | null
          order_id: string
          owner_id: string
          paid_on: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee_amount?: number | null
          id?: string
          kind: string
          method?: string | null
          order_id: string
          owner_id?: string
          paid_on?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_amount?: number | null
          id?: string
          kind?: string
          method?: string | null
          order_id?: string
          owner_id?: string
          paid_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          board_position: number
          channel_fees: number
          channel_id: string | null
          consumed_at: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          due_date: string | null
          filament_skipped: boolean
          id: string
          notes: string | null
          number: string
          owner_id: string
          paid_at: string | null
          paid_by_platform: boolean
          platform_order_number: string | null
          quote_id: string | null
          shipping_cost: number
          status: string
          status_changed_at: string
          total_amount: number
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          board_position?: number
          channel_fees?: number
          channel_id?: string | null
          consumed_at?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          due_date?: string | null
          filament_skipped?: boolean
          id?: string
          notes?: string | null
          number?: string
          owner_id?: string
          paid_at?: string | null
          paid_by_platform?: boolean
          platform_order_number?: string | null
          quote_id?: string | null
          shipping_cost?: number
          status?: string
          status_changed_at?: string
          total_amount?: number
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          board_position?: number
          channel_fees?: number
          channel_id?: string | null
          consumed_at?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          due_date?: string | null
          filament_skipped?: boolean
          id?: string
          notes?: string | null
          number?: string
          owner_id?: string
          paid_at?: string | null
          paid_by_platform?: boolean
          platform_order_number?: string | null
          quote_id?: string | null
          shipping_cost?: number
          status?: string
          status_changed_at?: string
          total_amount?: number
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "sales_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      print_failures: {
        Row: {
          cost: number
          created_at: string
          filament_id: string | null
          grams_lost: number
          id: string
          minutes_lost: number
          occurred_at: string
          order_id: string | null
          owner_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          cost?: number
          created_at?: string
          filament_id?: string | null
          grams_lost?: number
          id?: string
          minutes_lost?: number
          occurred_at?: string
          order_id?: string | null
          owner_id?: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          filament_id?: string | null
          grams_lost?: number
          id?: string
          minutes_lost?: number
          occurred_at?: string
          order_id?: string | null
          owner_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_failures_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_failures_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          lifetime_hours: number | null
          maintenance_per_hour: number | null
          model: string | null
          name: string
          owner_id: string
          power_watts: number | null
          purchase_price: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          lifetime_hours?: number | null
          maintenance_per_hour?: number | null
          model?: string | null
          name: string
          owner_id?: string
          power_watts?: number | null
          purchase_price?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          lifetime_hours?: number | null
          maintenance_per_hour?: number | null
          model?: string | null
          name?: string
          owner_id?: string
          power_watts?: number | null
          purchase_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          active: boolean
          cost_sheet_id: string | null
          created_at: string
          id: string
          image_path: string | null
          name: string
          owner_id: string
          product_id: string
          sku: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          cost_sheet_id?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          name: string
          owner_id?: string
          product_id: string
          sku?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          cost_sheet_id?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          name?: string
          owner_id?: string
          product_id?: string
          sku?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_cost_sheet_id_fkey"
            columns: ["cost_sheet_id"]
            isOneToOne: false
            referencedRelation: "cost_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          model_license: string | null
          model_source: string | null
          model_url: string | null
          name: string
          owner_id: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          model_license?: string | null
          model_source?: string | null
          model_url?: string | null
          name: string
          owner_id?: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          model_license?: string | null
          model_source?: string | null
          model_url?: string | null
          name?: string
          owner_id?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          cost_input: Json | null
          cost_sheet_id: string | null
          cost_source: string | null
          created_at: string
          description: string
          id: string
          image_path: string | null
          owner_id: string
          quantity: number
          quote_id: string
          sort_order: number
          unit_cost: number | null
          unit_labor_cost: number | null
          unit_price: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          cost_input?: Json | null
          cost_sheet_id?: string | null
          cost_source?: string | null
          created_at?: string
          description: string
          id?: string
          image_path?: string | null
          owner_id?: string
          quantity?: number
          quote_id: string
          sort_order?: number
          unit_cost?: number | null
          unit_labor_cost?: number | null
          unit_price: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          cost_input?: Json | null
          cost_sheet_id?: string | null
          cost_source?: string | null
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          owner_id?: string
          quantity?: number
          quote_id?: string
          sort_order?: number
          unit_cost?: number | null
          unit_labor_cost?: number | null
          unit_price?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_cost_sheet_id_fkey"
            columns: ["cost_sheet_id"]
            isOneToOne: false
            referencedRelation: "cost_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          created_at: string
          customer_id: string | null
          deposit_pct: number | null
          discount_type: string
          discount_value: number
          id: string
          notes: string | null
          number: string
          owner_id: string
          payment_terms: string | null
          production_days: number | null
          rejected_at: string | null
          revised_at: string | null
          revision: number
          sent_at: string | null
          shipping_cost: number
          status: string
          token: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          customer_id?: string | null
          deposit_pct?: number | null
          discount_type?: string
          discount_value?: number
          id?: string
          notes?: string | null
          number?: string
          owner_id?: string
          payment_terms?: string | null
          production_days?: number | null
          rejected_at?: string | null
          revised_at?: string | null
          revision?: number
          sent_at?: string | null
          shipping_cost?: number
          status?: string
          token?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          customer_id?: string | null
          deposit_pct?: number | null
          discount_type?: string
          discount_value?: number
          id?: string
          notes?: string | null
          number?: string
          owner_id?: string
          payment_terms?: string | null
          production_days?: number | null
          rejected_at?: string | null
          revised_at?: string | null
          revision?: number
          sent_at?: string | null
          shipping_cost?: number
          status?: string
          token?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_channels: {
        Row: {
          active: boolean
          cash_fixed: number
          cash_pct: number
          commission_pct: number | null
          created_at: string
          credit_fixed: number
          credit_pct: number
          debit_fixed: number
          debit_pct: number
          extra_pct: number | null
          fixed_fee: number | null
          id: string
          kind: string
          name: string
          owner_id: string
          pix_fixed: number
          pix_pct: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          cash_fixed?: number
          cash_pct?: number
          commission_pct?: number | null
          created_at?: string
          credit_fixed?: number
          credit_pct?: number
          debit_fixed?: number
          debit_pct?: number
          extra_pct?: number | null
          fixed_fee?: number | null
          id?: string
          kind: string
          name: string
          owner_id?: string
          pix_fixed?: number
          pix_pct?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          cash_fixed?: number
          cash_pct?: number
          commission_pct?: number | null
          created_at?: string
          credit_fixed?: number
          credit_pct?: number
          debit_fixed?: number
          debit_pct?: number
          extra_pct?: number | null
          fixed_fee?: number | null
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          pix_fixed?: number
          pix_pct?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          default_margin_pct: number
          default_quote_terms: string | null
          energy_rate_kwh: number | null
          failure_margin_pct: number
          id: string
          labor_hour_rate: number | null
          min_margin_pct: number
          owner_id: string
          pix_key: string | null
          pix_key_type: string | null
          quote_validity_days: number
          rounding_rule: string
          store_city: string | null
          store_email: string | null
          store_instagram: string | null
          store_name: string
          store_whatsapp: string | null
          tax_pct: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_margin_pct?: number
          default_quote_terms?: string | null
          energy_rate_kwh?: number | null
          failure_margin_pct?: number
          id?: string
          labor_hour_rate?: number | null
          min_margin_pct?: number
          owner_id?: string
          pix_key?: string | null
          pix_key_type?: string | null
          quote_validity_days?: number
          rounding_rule?: string
          store_city?: string | null
          store_email?: string | null
          store_instagram?: string | null
          store_name?: string
          store_whatsapp?: string | null
          tax_pct?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_margin_pct?: number
          default_quote_terms?: string | null
          energy_rate_kwh?: number | null
          failure_margin_pct?: number
          id?: string
          labor_hour_rate?: number | null
          min_margin_pct?: number
          owner_id?: string
          pix_key?: string | null
          pix_key_type?: string | null
          quote_validity_days?: number
          rounding_rule?: string
          store_city?: string | null
          store_email?: string | null
          store_instagram?: string | null
          store_name?: string
          store_whatsapp?: string | null
          tax_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      supplies: {
        Row: {
          created_at: string
          id: string
          is_packaging: boolean
          name: string
          notes: string | null
          owner_id: string
          stock_qty: number | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_packaging?: boolean
          name: string
          notes?: string | null
          owner_id?: string
          stock_qty?: number | null
          unit?: string
          unit_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_packaging?: boolean
          name?: string
          notes?: string | null
          owner_id?: string
          stock_qty?: number | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          fee_amount: number
          filament_id: string | null
          gross_amount: number
          id: string
          is_fixed: boolean
          kind: string
          occurred_on: string
          order_id: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          fee_amount?: number
          filament_id?: string | null
          gross_amount: number
          id?: string
          is_fixed?: boolean
          kind: string
          occurred_on?: string
          order_id?: string | null
          owner_id?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          fee_amount?: number
          filament_id?: string | null
          gross_amount?: number
          id?: string
          is_fixed?: boolean
          kind?: string
          occurred_on?: string
          order_id?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_channel_prices: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          owner_id: string
          price: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          owner_id?: string
          price: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          price?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_channel_prices_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "sales_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_channel_prices_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_public_quote: {
        Args: { p_revision: number; p_token: string }
        Returns: undefined
      }
      cancel_order: {
        Args: { p_order_id: string; p_printed: boolean; p_refund?: number }
        Returns: undefined
      }
      consume_order_filament: {
        Args: { p_lines: Json; p_order_id: string; p_skip?: boolean }
        Returns: undefined
      }
      create_order: { Args: { p_order: Json }; Returns: string }
      delete_order: {
        Args: { p_number: string; p_order_id: string }
        Returns: undefined
      }
      get_public_quote: { Args: { p_token: string }; Returns: Json }
      record_print_failure: {
        Args: { p_failure: Json; p_order_id: string }
        Returns: string
      }
      save_cost_sheet: {
        Args: { p_sheet: Json; p_unit_cost: number }
        Returns: string
      }
      save_product: { Args: { p_product: Json }; Returns: string }
      save_quote: { Args: { p_quote: Json }; Returns: string }
      set_order_item_cost: {
        Args: {
          p_cost_input: Json
          p_cost_sheet_id?: string
          p_cost_source: string
          p_item_id: string
          p_unit_cost: number
          p_unit_labor_cost: number
        }
        Returns: undefined
      }
      set_order_payment: {
        Args: {
          p_fee: number
          p_kind: string
          p_method: string
          p_order_id: string
          p_paid_on: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
