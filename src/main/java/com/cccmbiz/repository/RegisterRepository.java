package com.cccmbiz.repository;

import com.cccmbiz.domain.Register;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class RegisterRepository implements PanacheRepository<Register> {

    public Register findByHouseholdId(Integer householdId) {
        return find("householdId", householdId).firstResult();
    }
}
