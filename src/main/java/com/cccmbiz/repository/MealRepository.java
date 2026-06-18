package com.cccmbiz.repository;

import com.cccmbiz.domain.Meal;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class MealRepository implements PanacheRepository<Meal> {

    public List<Meal> findByLocation(Byte location) {
        return list("location", location);
    }
}
